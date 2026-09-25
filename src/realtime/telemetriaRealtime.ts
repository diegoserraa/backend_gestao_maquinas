import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { TelemetriaService } from "../services/TelemetriaService";
import { registrarWss, type ClienteWS } from "./wsBus";
import { TokenPayload } from "../types/auth";
import { logger } from "../config/logger";
import { permissaoService } from "../services/PermissaoService";

const log = logger.child({ modulo: "ws-telemetria" });

// re-export para compatibilidade com quem já importava daqui
export { broadcastTelemetria, broadcastEvento } from "./wsBus";

/**
 * Hub WebSocket do tempo real (telemetria, alertas e notificações).
 *
 * - Caminho: /ws/telemetria?token=<jwt>
 * - Exige um token válido na query string — o navegador não consegue
 *   mandar um header Authorization customizado no handshake do
 *   WebSocket, então o token vem por aí mesmo (nunca em log de servidor
 *   HTTP porque a troca acontece só uma vez, no upgrade).
 * - O cliente só recebe (mensagens enviadas pelo cliente são ignoradas).
 * - Qualquer usuário ATIVO conecta (recebe as próprias notificações em tempo real).
 * - Telemetria/alertas só vão para quem tem "monitoramento.ver", e sempre só
 *   da própria empresa; ao conectar essas pessoas recebem o snapshot.
 * - Se as permissões do usuário mudam, a conexão é fechada e o navegador
 *   reconecta já com as permissões novas (ver PermissaoService.invalidar).
 * - Keep-alive por ping/pong a cada 30s (derruba conexões mortas).
 */

const WS_PATH = "/ws/telemetria";
const HEARTBEAT_MS = 30_000;
const MAX_CLIENTES = 200;

let wss: WebSocketServer | null = null;
const service = new TelemetriaService();

function autenticar(url: string): TokenPayload | null {
    try {
        const token = new URL(url, "http://localhost").searchParams.get("token");
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    } catch {
        return null;
    }
}

async function aceitar(req: IncomingMessage, socket: Duplex, head: Buffer, url: string): Promise<void> {
    const payload = autenticar(url);

    if (!payload) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
    }

    // mesma regra da API: usuário ativo, da mesma empresa do token
    const perfil = await permissaoService.perfil(payload.id).catch(() => null);

    if (!perfil || !perfil.ativo || !perfil.empresaAtiva || perfil.empresaId !== payload.empresa_id || (payload.sv ?? 0) !== perfil.versaoSessao) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
    }

    if ((wss as WebSocketServer).clients.size >= MAX_CLIENTES) {
        socket.destroy();
        return;
    }

    const monitora = perfil.permissoes.has("monitoramento.ver");

    (wss as WebSocketServer).handleUpgrade(req, socket, head, (ws) => {
        const cliente = ws as ClienteWS;
        cliente.empresaId = payload.empresa_id;
        cliente.usuarioId = payload.id;
        cliente.monitora = monitora;
        (wss as WebSocketServer).emit("connection", ws, req);
    });
}

export function initTelemetriaRealtime(server: HttpServer): void {
    wss = new WebSocketServer({ noServer: true });
    registrarWss(wss);

    server.on("upgrade", (req, socket, head) => {
        // só tratamos o nosso path; outros upgrades seguem o fluxo normal
        const { url = "" } = req;

        if (!url.startsWith(WS_PATH)) {
            return;
        }

        void aceitar(req, socket, head, url);
    });

    wss.on("connection", async (ws: ClienteWS) => {
        ws.isAlive = true;

        ws.on("pong", () => {
            ws.isAlive = true;
        });

        // ignora qualquer coisa que o cliente mande
        ws.on("message", () => { });
        ws.on("error", () => { });

        // snapshot inicial — só para quem monitora, só as máquinas da própria empresa
        if (!ws.monitora) return;

        try {
            const atual = await service.listarAtual(ws.empresaId!);
            enviar(ws, { type: "snapshot", data: atual });
        } catch (erro) {
            log.error({ err: erro, empresaId: ws.empresaId }, "erro no snapshot inicial");
        }
    });

    const intervalo = setInterval(() => {
        wss?.clients.forEach((cliente) => {
            const ws = cliente as ClienteWS;

            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_MS);

    wss.on("close", () => clearInterval(intervalo));

    log.info({ path: WS_PATH }, "WebSocket de telemetria ativo");
}

function enviar(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

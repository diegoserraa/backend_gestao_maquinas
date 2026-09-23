import type { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { TelemetriaService } from "../services/TelemetriaService";
import { registrarWss } from "./wsBus";
import { TokenPayload } from "../types/auth";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "ws-telemetria" });

// re-export para compatibilidade com quem já importava daqui
export { broadcastTelemetria, broadcastEvento } from "./wsBus";

/**
 * Hub WebSocket da telemetria.
 *
 * - Caminho: /ws/telemetria?token=<jwt>
 * - Exige um token válido na query string — o navegador não consegue
 *   mandar um header Authorization customizado no handshake do
 *   WebSocket, então o token vem por aí mesmo (nunca em log de servidor
 *   HTTP porque a troca acontece só uma vez, no upgrade).
 * - O cliente só recebe (mensagens enviadas pelo cliente são ignoradas).
 * - Ao conectar recebe o snapshot (só da própria empresa); depois recebe
 *   só os eventos da própria empresa.
 * - Keep-alive por ping/pong a cada 30s (derruba conexões mortas).
 */

const WS_PATH = "/ws/telemetria";
const HEARTBEAT_MS = 30_000;
const MAX_CLIENTES = 200;

interface ClienteWS extends WebSocket {
    isAlive?: boolean;
    empresaId?: string;
}

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

export function initTelemetriaRealtime(server: HttpServer): void {
    wss = new WebSocketServer({ noServer: true });
    registrarWss(wss);

    server.on("upgrade", (req, socket, head) => {
        // só tratamos o nosso path; outros upgrades seguem o fluxo normal
        const { url = "" } = req;

        if (!url.startsWith(WS_PATH)) {
            return;
        }

        const payload = autenticar(url);
        if (!payload) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }

        if ((wss as WebSocketServer).clients.size >= MAX_CLIENTES) {
            socket.destroy();
            return;
        }

        (wss as WebSocketServer).handleUpgrade(req, socket, head, (ws) => {
            (ws as ClienteWS).empresaId = payload.empresa_id;
            (wss as WebSocketServer).emit("connection", ws, req);
        });
    });

    wss.on("connection", async (ws: ClienteWS) => {
        ws.isAlive = true;

        ws.on("pong", () => {
            ws.isAlive = true;
        });

        // ignora qualquer coisa que o cliente mande
        ws.on("message", () => { });
        ws.on("error", () => { });

        // snapshot inicial — só as máquinas da própria empresa
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

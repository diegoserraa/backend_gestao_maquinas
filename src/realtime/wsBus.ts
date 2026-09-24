import type { WebSocketServer } from "ws";
import { WebSocket } from "ws";

/**
 * Barramento do WebSocket (tempo real) — sem dependência de services,
 * para evitar ciclos de import (services chamam broadcast, o realtime
 * registra o servidor aqui).
 *
 * Cada conexão é autenticada e marcada (ver telemetriaRealtime.ts) com:
 *  - empresaId: a empresa do usuário;
 *  - usuarioId: quem é;
 *  - monitora: se tem a permissão "monitoramento.ver" (só esses recebem telemetria/alertas).
 * Toda entrega é filtrada por essas marcas — nunca broadcast geral.
 */
export interface ClienteWS extends WebSocket {
    isAlive?: boolean;
    empresaId?: string;
    usuarioId?: number;
    monitora?: boolean;
}

/** Código de fechamento: "suas permissões mudaram, reconecte". */
export const WS_CODIGO_REAVALIAR = 4001;

let wss: WebSocketServer | null = null;

export function registrarWss(w: WebSocketServer): void {
    wss = w;
}

function paraCada(fn: (c: ClienteWS) => void): void {
    if (!wss) return;
    wss.clients.forEach((cliente) => {
        const c = cliente as ClienteWS;
        if (c.readyState === WebSocket.OPEN) fn(c);
    });
}

/**
 * Evento de monitoramento (telemetria, alertas): só para os clientes da MESMA empresa
 * que têm permissão de ver o monitoramento.
 */
export function broadcastEvento(type: string, data: unknown, empresaId: string): void {
    if (!wss) return;
    const mensagem = JSON.stringify({ type, data });
    paraCada((c) => {
        if (c.empresaId === empresaId && c.monitora) c.send(mensagem);
    });
}

export function broadcastTelemetria(data: unknown, empresaId: string): void {
    broadcastEvento("telemetria", data, empresaId);
}

/**
 * Evento pessoal (ex.: notificação): só para as conexões (abas/aparelhos) daquele usuário —
 * e apenas se a conexão for da empresa informada. Devolve quantas conexões receberam.
 */
export function enviarParaUsuario(usuarioId: number, empresaId: string, type: string, data: unknown): number {
    if (!wss) return 0;
    const mensagem = JSON.stringify({ type, data });
    let enviados = 0;

    paraCada((c) => {
        if (c.usuarioId === usuarioId && c.empresaId === empresaId) {
            c.send(mensagem);
            enviados++;
        }
    });

    return enviados;
}

/**
 * As permissões/situação do usuário mudaram (ou ele foi desativado): fecha as conexões dele.
 * O navegador reconecta sozinho e a conexão nova já nasce com as permissões atuais.
 */
export function reavaliarUsuario(usuarioId: number): void {
    if (!wss) return;
    wss.clients.forEach((cliente) => {
        const c = cliente as ClienteWS;
        if (c.usuarioId === usuarioId) c.close(WS_CODIGO_REAVALIAR, "permissoes-alteradas");
    });
}

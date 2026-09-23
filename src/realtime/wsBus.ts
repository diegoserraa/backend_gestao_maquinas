import type { WebSocketServer } from "ws";
import { WebSocket } from "ws";

/**
 * Barramento do WebSocket de telemetria — sem dependência de services,
 * para evitar ciclos de import (services chamam broadcast, o realtime
 * registra o servidor aqui).
 */

// cada conexão é autenticada e marcada com a empresa do usuário (ver
// telemetriaRealtime.ts) — não reimportamos o tipo de lá pra não criar
// ciclo, só duck-typing na propriedade.
interface ClienteComEmpresa extends WebSocket {
    empresaId?: string;
}

let wss: WebSocketServer | null = null;

export function registrarWss(w: WebSocketServer): void {
    wss = w;
}

/**
 * `empresaId` é obrigatório: todo evento pertence a uma empresa e só pode
 * ir para os clientes autenticados dessa mesma empresa — nunca broadcast
 * geral (antes ia pra todo mundo conectado, de qualquer empresa).
 */
export function broadcastEvento(type: string, data: unknown, empresaId: string): void {
    if (!wss) return;
    const mensagem = JSON.stringify({ type, data });
    wss.clients.forEach((cliente) => {
        const c = cliente as ClienteComEmpresa;
        if (c.readyState === WebSocket.OPEN && c.empresaId === empresaId) {
            c.send(mensagem);
        }
    });
}

export function broadcastTelemetria(data: unknown, empresaId: string): void {
    broadcastEvento("telemetria", data, empresaId);
}

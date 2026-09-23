import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { app } from "../src/app";
import { initTelemetriaRealtime } from "../src/realtime/telemetriaRealtime";
import { broadcastEvento } from "../src/realtime/wsBus";
import { criarFixture, fecharPool, limparTudo, Fixture } from "./helpers/fixture";

let fx: Fixture;
let server: http.Server;
let porta: number;

beforeAll(async () => {
  fx = await criarFixture();
  server = http.createServer(app);
  initTelemetriaRealtime(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  porta = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((ok) => server.close(() => ok()));
  await limparTudo();
  await fecharPool();
});

function conectar(token?: string): Promise<{ ws: WebSocket; msgs: any[] }> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${porta}/ws/telemetria${token ? `?token=${token}` : ""}`;
    const ws = new WebSocket(url);
    const msgs: any[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
    ws.on("open", () => resolve({ ws, msgs }));
    ws.on("error", reject);
    ws.on("unexpected-response", (_r, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("WebSocket de telemetria", () => {
  it("sem token a conexão é recusada", async () => {
    await expect(conectar()).rejects.toThrow();
  });

  it("token inválido é recusado", async () => {
    await expect(conectar("lixo")).rejects.toThrow();
  });

  it("snapshot inicial só traz máquinas da própria empresa", async () => {
    const { ws, msgs } = await conectar(fx.B.tokenAdmin);
    await esperar(1500);
    ws.close();
    const snapshot = msgs.find((m) => m.type === "snapshot");
    expect(snapshot).toBeDefined();
    const txt = JSON.stringify(snapshot);
    expect(txt).toContain(fx.B.marcador);
    expect(txt).not.toContain(fx.A.marcador);
  });

  it("evento da empresa A não chega no cliente da B (e chega no da A)", async () => {
    const a = await conectar(fx.A.tokenAdmin);
    const b = await conectar(fx.B.tokenAdmin);
    await esperar(1500);
    a.msgs.length = 0;
    b.msgs.length = 0;

    broadcastEvento("alerta", { segredo: "so-da-A" }, fx.A.empresaId);
    await esperar(500);
    a.ws.close();
    b.ws.close();

    expect(JSON.stringify(a.msgs)).toContain("so-da-A");
    expect(JSON.stringify(b.msgs)).not.toContain("so-da-A");
  });
});

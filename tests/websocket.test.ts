import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { app } from "../src/app";
import { initTelemetriaRealtime } from "../src/realtime/telemetriaRealtime";
import { broadcastEvento } from "../src/realtime/wsBus";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";
import { NotificacaoService } from "../src/services/NotificacaoService";
import { permissaoService } from "../src/services/PermissaoService";

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

/* ================= notificações em tempo real ================= */

describe("notificações em tempo real (WebSocket)", () => {
  const notificacoes = new NotificacaoService();

  const criarPara = (usuarioId: number, titulo: string) =>
    notificacoes.criar({ usuario_id: usuarioId, titulo, mensagem: "msg", tipo: "OS_CRIADA", url: "/ordens-servico/1" });

  it("a notificação chega na hora, só para o dono, com o contador de não lidas", async () => {
    const dono = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    const colega = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    const dono2 = await conectar(dono.token);
    const colega2 = await conectar(colega.token);
    await esperar(300);

    await criarPara(dono.id, "so-do-dono");
    await esperar(500);
    dono2.ws.close();
    colega2.ws.close();

    const recebida = dono2.msgs.find((m) => m.type === "notificacao");
    expect(recebida).toBeDefined();
    expect(recebida.data.notificacao.titulo).toBe("so-do-dono");
    expect(recebida.data.nao_lidas).toBe(1);
    expect(JSON.stringify(colega2.msgs)).not.toContain("so-do-dono");
  });

  it("chega em todas as abas/aparelhos do mesmo usuário", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: ["maquinas.ver"] });
    const aba1 = await conectar(u.token);
    const aba2 = await conectar(u.token);
    await esperar(300);

    await criarPara(u.id, "duas-abas");
    await esperar(500);
    aba1.ws.close();
    aba2.ws.close();

    expect(aba1.msgs.some((m) => m.type === "notificacao")).toBe(true);
    expect(aba2.msgs.some((m) => m.type === "notificacao")).toBe(true);
  });

  it("ISOLAMENTO: quem é de outra empresa nunca recebe, nem com o mesmo id de usuário na mira", async () => {
    const alvo = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    const deOutraEmpresa = await conectar(fx.B.tokenAdmin);
    const doAlvo = await conectar(alvo.token);
    await esperar(1200);
    deOutraEmpresa.msgs.length = 0;

    await criarPara(alvo.id, "segredo-da-A");
    await esperar(500);
    deOutraEmpresa.ws.close();
    doAlvo.ws.close();

    expect(JSON.stringify(deOutraEmpresa.msgs)).not.toContain("segredo-da-A");
    expect(JSON.stringify(doAlvo.msgs)).toContain("segredo-da-A");
  });

  it("marcar como lida / excluir / marcar todas sincroniza as outras abas com o contador certo", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    const n1 = await criarPara(u.id, "n1");
    await criarPara(u.id, "n2");
    const aba = await conectar(u.token);
    await esperar(300);

    await notificacoes.marcarComoLida(n1.id!, u.id, fx.A.empresaId);
    await notificacoes.marcarTodasComoLidas(u.id, fx.A.empresaId);
    await esperar(500);
    aba.ws.close();

    const sync = aba.msgs.filter((m) => m.type === "notificacao_sync");
    expect(sync.map((m) => m.data.acao)).toEqual(["lida", "todas_lidas"]);
    expect(sync[0].data.nao_lidas).toBe(1);
    expect(sync[1].data.nao_lidas).toBe(0);
  });

  it("quem NÃO tem 'ver monitoramento' recebe notificação, mas não recebe alertas/telemetria", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["maquinas.ver"] });
    const mon = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["monitoramento.ver"] });
    const semMon = await conectar(u.token);
    const comMon = await conectar(mon.token);
    await esperar(1200);
    semMon.msgs.length = 0;
    comMon.msgs.length = 0;

    broadcastEvento("alerta", { marca: "alerta-visivel" }, fx.A.empresaId);
    await criarPara(u.id, "notif-operador");
    await esperar(500);
    semMon.ws.close();
    comMon.ws.close();

    expect(JSON.stringify(semMon.msgs)).not.toContain("alerta-visivel");
    expect(semMon.msgs.some((m) => m.type === "snapshot")).toBe(false);
    expect(JSON.stringify(semMon.msgs)).toContain("notif-operador");
    expect(JSON.stringify(comMon.msgs)).toContain("alerta-visivel");
    expect(comMon.msgs.some((m) => m.type === "notificacao")).toBe(false);
  });

  it("mudar as permissões do usuário derruba a conexão (código 4001) para ele reconectar com as novas", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["monitoramento.ver"] });
    const { ws } = await conectar(u.token);
    await esperar(300);

    const fechou = new Promise<number>((ok) => ws.on("close", (codigo) => ok(codigo)));
    permissaoService.invalidar(u.id);

    expect(await fechou).toBe(4001);
  });

  it("falha do tempo real não impede de criar a notificação", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    const n = await criarPara(u.id, "sem-ninguem-conectado");
    expect(n.id).toBeGreaterThan(0);
    const { rows } = await pool.query("SELECT titulo FROM notificacoes WHERE id = $1", [n.id]);
    expect(rows[0].titulo).toBe("sem-ninguem-conectado");
  });
});

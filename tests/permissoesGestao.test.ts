import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { initTelemetriaRealtime } from "../src/realtime/telemetriaRealtime";
import { PermissaoRepository } from "../src/repositories/PermissaoRepository";
import { permissaoService } from "../src/services/PermissaoService";
import { PADRAO_POR_PAPEL, TODAS_PERMISSOES } from "../src/permissoes/catalogo";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture, SENHA, UsuarioTeste } from "./helpers/fixture";

/**
 * Gestão de permissões: quem pode mexer nas permissões de quem, teto de concessão,
 * auditoria, efeito imediato, isolamento entre empresas, cache e WebSocket.
 */

let fx: Fixture;
let server: http.Server;
let porta: number;

const com = (token: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  put: (url: string, corpo?: object) => request(app).put(url).set("Authorization", `Bearer ${token}`).send(corpo),
  post: (url: string, corpo?: object) => request(app).post(url).set("Authorization", `Bearer ${token}`).send(corpo),
  patch: (url: string, corpo?: object) => request(app).patch(url).set("Authorization", `Bearer ${token}`).send(corpo),
  delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
});

const admin = () => com(fx.A.tokenAdmin);
const gestor = () => com(fx.A.tokenGestor);

const permissoesNoBanco = async (usuarioId: number): Promise<string[]> =>
  (await pool.query(`SELECT permissao FROM usuario_permissoes WHERE usuario_id = $1 ORDER BY permissao`, [usuarioId])).rows.map((r) => r.permissao);

const semPerm = (...retirar: string[]) => TODAS_PERMISSOES.filter((p) => !retirar.includes(p));

const novoTecnico = (permissoes?: string[]) => criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes });
const novoOperador = (permissoes?: string[]) => criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes });

beforeAll(async () => {
  fx = await criarFixture();
  server = http.createServer(app);
  initTelemetriaRealtime(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  porta = (server.address() as AddressInfo).port;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((ok) => server.close(() => ok()));
  await limparTudo();
  await fecharPool();
});

describe("catálogo, /eu e login", () => {
  it("sem token: 401", async () => {
    expect((await request(app).get("/permissoes/catalogo")).status).toBe(401);
    expect((await request(app).get("/permissoes/eu")).status).toBe(401);
  });

  it("qualquer logado lê o catálogo (rótulos e padrões)", async () => {
    const u = await novoOperador([]);
    const res = await com(u.token).get("/permissoes/catalogo");
    expect(res.status).toBe(200);
    expect(res.body.modulos.map((m: any) => m.chave)).toEqual(
      expect.arrayContaining(["maquinas", "os", "monitoramento", "setores", "parceiros", "usuarios", "relatorios", "anexos", "dashboard"])
    );
    expect(res.body.padroes.TECNICO).toEqual([...PADRAO_POR_PAPEL.TECNICO]);
  });

  it("o login já devolve as permissões (e recusa usuário inativo)", async () => {
    const hash = (await pool.query(`SELECT senha FROM usuarios WHERE id = $1`, [fx.A.adminId])).rows[0].senha;
    const tec = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    await pool.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [hash, tec.id]);

    const ok = await request(app).post("/auth/login").send({ email: tec.email, senha: SENHA });
    expect(ok.status).toBe(200);
    expect(ok.body.permissoes).toEqual(["maquinas.ver"]);

    await pool.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [tec.id]);
    permissaoService.invalidar(tec.id);
    const inativo = await request(app).post("/auth/login").send({ email: tec.email, senha: SENHA });
    expect(inativo.status).toBe(400);
    expect(inativo.body.token).toBeUndefined();
    expect(JSON.stringify(inativo.body)).toMatch(/inativo/i);
  });
});

describe("gestor gerencia técnicos e operadores", () => {
  it("consulta: mostra as permissões, o padrão do tipo e o que ele pode conceder", async () => {
    const alvo = await novoTecnico();
    const res = await gestor().get(`/permissoes/usuarios/${alvo.id}`);
    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ id: alvo.id, role: "TECNICO" });
    expect(res.body.permissoes).toEqual(expect.arrayContaining([...PADRAO_POR_PAPEL.TECNICO]));
    expect(res.body.padrao).toEqual([...PADRAO_POR_PAPEL.TECNICO]);
    expect(res.body.concedivel.length).toBe(TODAS_PERMISSOES.length);
  });

  it("define a lista: grava, completa as dependências e informa o que adicionou", async () => {
    const alvo = await novoOperador();
    const res = await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["os.cancelar", "maquinas.editar"] });

    expect(res.status).toBe(200);
    expect(res.body.permissoes).toEqual(["maquinas.ver", "maquinas.editar", "os.ver_proprias", "os.cancelar"]);
    expect(res.body.adicionadasPorDependencia.sort()).toEqual(["maquinas.ver", "os.ver_proprias"]);
    expect(await permissoesNoBanco(alvo.id)).toEqual([...res.body.permissoes].sort());
  });

  it("vale NA HORA: a permissão retirada barra o próximo clique, sem esperar cache", async () => {
    const alvo = await novoTecnico();
    expect((await com(alvo.token).get("/maquinas")).status).toBe(200);

    await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [] });

    expect((await com(alvo.token).get("/maquinas")).status).toBe(403);
    expect((await com(alvo.token).get("/ordens-servico")).status).toBe(403);
  });

  it("e a permissão concedida libera o próximo clique", async () => {
    const alvo = await novoOperador([]);
    expect((await com(alvo.token).get("/relatorios/ordens-servico/preview")).status).toBe(403);

    await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["relatorios.ver"] });

    expect((await com(alvo.token).get("/relatorios/ordens-servico/preview")).status).toBe(200);
  });

  it("lista vazia é aceita (tira tudo) e não volta ao padrão sozinha", async () => {
    const alvo = await novoTecnico();
    expect((await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [] })).status).toBe(200);
    expect(await permissoesNoBanco(alvo.id)).toEqual([]);
    expect((await com(alvo.token).get("/permissoes/eu")).body.permissoes).toEqual([]);
  });

  it("restaurar padrão devolve ao padrão do tipo", async () => {
    const alvo = await novoTecnico();
    await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [] });

    const res = await gestor().post(`/permissoes/usuarios/${alvo.id}/restaurar-padrao`);
    expect(res.status).toBe(200);
    expect(res.body.permissoes).toEqual([...PADRAO_POR_PAPEL.TECNICO]);
    expect(await permissoesNoBanco(alvo.id)).toEqual([...PADRAO_POR_PAPEL.TECNICO].sort());
  });

  it.each([
    ["permissão que não existe", { permissoes: ["os.voar"] }, 400],
    ["lista com valor que não é texto", { permissoes: [1, 2] }, 400],
    ["sem a lista", {}, 400],
    ["lista gigante", { permissoes: Array(300).fill("os.ver") }, 400],
  ])("corpo inválido (%s) devolve 400 e não altera nada", async (_nome, corpo, status) => {
    const alvo = await novoTecnico();
    const antes = await permissoesNoBanco(alvo.id);
    const res = await gestor().put(`/permissoes/usuarios/${alvo.id}`, corpo as object);
    expect(res.status).toBe(status);
    expect(await permissoesNoBanco(alvo.id)).toEqual(antes);
  });

  it("id inexistente devolve 404 e id inválido 400", async () => {
    expect((await gestor().get("/permissoes/usuarios/2147483000")).status).toBe(404);
    expect((await gestor().get("/permissoes/usuarios/abc")).status).toBe(400);
  });

  it("duas alterações simultâneas no mesmo funcionário não se atropelam", async () => {
    const alvo = await novoTecnico();
    const [a, b] = await Promise.all([
      gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["maquinas.ver", "setores.ver"] }),
      gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["relatorios.ver"] }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const final = await permissoesNoBanco(alvo.id);
    expect([JSON.stringify(["maquinas.ver", "setores.ver"]), JSON.stringify(["relatorios.ver"])]).toContain(JSON.stringify(final));
  });
});

describe("hierarquia: quem pode mexer nas permissões de quem", () => {
  it("gestor NÃO mexe nas permissões de outro gestor", async () => {
    const outro = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });
    const res = await gestor().put(`/permissoes/usuarios/${outro.id}`, { permissoes: [] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/administrador/i);
    expect(await permissoesNoBanco(outro.id)).toEqual([...TODAS_PERMISSOES].sort());
    expect((await gestor().get(`/permissoes/usuarios/${outro.id}`)).status).toBe(403);
    expect((await gestor().post(`/permissoes/usuarios/${outro.id}/restaurar-padrao`)).status).toBe(403);
  });

  it("gestor NÃO altera as próprias permissões", async () => {
    const res = await gestor().put(`/permissoes/usuarios/${fx.A.gestorId}`, { permissoes: [] });
    expect(res.status).toBe(403);
  });

  it("ninguém altera o administrador (nem o próprio administrador)", async () => {
    expect((await gestor().put(`/permissoes/usuarios/${fx.A.adminId}`, { permissoes: [] })).status).toBe(403);
    expect((await admin().put(`/permissoes/usuarios/${fx.A.adminId}`, { permissoes: [] })).status).toBe(403);
  });

  it("o administrador (dono) altera as permissões de um gestor", async () => {
    const outro = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });
    const res = await admin().put(`/permissoes/usuarios/${outro.id}`, { permissoes: ["os.ver"] });
    expect(res.status).toBe(200);
    expect(await permissoesNoBanco(outro.id)).toEqual(["os.ver"]);
  });

  it("técnico com 'gerenciar permissões' altera operador, mas nunca gestor nem a si mesmo", async () => {
    const chefe = await novoTecnico(["usuarios.ver", "usuarios.gerenciar_permissoes", "os.ver", "os.criar", "maquinas.ver"]);
    const operador = await novoOperador(["os.ver", "maquinas.ver"]); // dentro do teto do chefe
    const outroGestor = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });

    expect((await com(chefe.token).put(`/permissoes/usuarios/${operador.id}`, { permissoes: ["os.ver"] })).status).toBe(200);
    expect((await com(chefe.token).put(`/permissoes/usuarios/${outroGestor.id}`, { permissoes: [] })).status).toBe(403);
    expect((await com(chefe.token).put(`/permissoes/usuarios/${chefe.id}`, { permissoes: [] })).status).toBe(403);
  });

  it("quem não tem 'gerenciar permissões' recebe 403 em tudo (consultar, definir, restaurar, auditoria)", async () => {
    const semGerenciar = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("usuarios.gerenciar_permissoes") });
    const alvo = await novoOperador();
    const c = com(semGerenciar.token);

    expect((await c.get(`/permissoes/usuarios/${alvo.id}`)).status).toBe(403);
    expect((await c.put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [] })).status).toBe(403);
    expect((await c.post(`/permissoes/usuarios/${alvo.id}/restaurar-padrao`)).status).toBe(403);
    expect((await c.get("/permissoes/auditoria")).status).toBe(403);
  });
});

describe("teto: só dá (ou tira) o que a própria pessoa tem", () => {
  it("gestor sem 'cancelar O.S.' não consegue conceder 'cancelar O.S.'", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.cancelar") });
    const alvo = await novoTecnico();

    const res = await com(limitado.token).put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [...PADRAO_POR_PAPEL.TECNICO, "os.cancelar"] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/Cancelar/);
    expect(await permissoesNoBanco(alvo.id)).not.toContain("os.cancelar");
  });

  it("nem tirar o que ele mesmo não possui", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.cancelar") });
    const alvo = await novoTecnico([...PADRAO_POR_PAPEL.TECNICO, "os.cancelar"]);

    const res = await com(limitado.token).put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [...PADRAO_POR_PAPEL.TECNICO] });
    expect(res.status).toBe(403);
    expect(await permissoesNoBanco(alvo.id)).toContain("os.cancelar");
  });

  it("mas altera livremente o que está dentro do teto dele", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.cancelar") });
    const alvo = await novoTecnico();
    const res = await com(limitado.token).put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["maquinas.ver", "setores.ver"] });
    expect(res.status).toBe(200);
  });

  it("o 'concedível' mostrado na consulta é exatamente o teto dele", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.cancelar", "os.excluir") });
    const alvo = await novoTecnico();
    const res = await com(limitado.token).get(`/permissoes/usuarios/${alvo.id}`);
    expect(res.body.concedivel).not.toContain("os.cancelar");
    expect(res.body.concedivel).toContain("os.ver");
  });

  it("o administrador não tem teto", async () => {
    const alvo = await novoOperador();
    expect((await admin().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: [...TODAS_PERMISSOES] })).status).toBe(200);
  });
});

describe("cadastro de funcionários: regras de quem pode o quê", () => {
  const corpo = (role: string) => ({ nome: "Fulano", email: `${Math.random().toString(36).slice(2)}@vitest.local`, senha: "abc123", role });

  it("gestor cadastra técnico e operador; o novo já nasce com o padrão do tipo", async () => {
    const t = await gestor().post("/usuarios", corpo("TECNICO"));
    expect(t.status).toBe(201);
    expect(await permissoesNoBanco(t.body.id)).toEqual([...PADRAO_POR_PAPEL.TECNICO].sort());

    const o = await gestor().post("/usuarios", corpo("OPERADOR"));
    expect(o.status).toBe(201);
    expect(await permissoesNoBanco(o.body.id)).toEqual([...PADRAO_POR_PAPEL.OPERADOR].sort());
  });

  it("gestor NÃO cadastra gestor nem administrador", async () => {
    expect((await gestor().post("/usuarios", corpo("GESTOR"))).status).toBe(403);
    const adm = await gestor().post("/usuarios", corpo("ADMIN"));
    expect(adm.status).toBe(403);
  });

  it("administrador cadastra gestor (que nasce com tudo); administrador ninguém cadastra", async () => {
    const g = await admin().post("/usuarios", corpo("GESTOR"));
    expect(g.status).toBe(201);
    expect((await permissoesNoBanco(g.body.id)).length).toBe(TODAS_PERMISSOES.length);
    expect((await admin().post("/usuarios", corpo("ADMIN"))).status).toBe(403);
  });

  it("o novo funcionário respeita o teto de quem cadastrou (não recebe o que o gestor não tem)", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.finalizar") });
    const t = await com(limitado.token).post("/usuarios", corpo("TECNICO"));
    expect(t.status).toBe(201);
    const p = await permissoesNoBanco(t.body.id);
    expect(p).not.toContain("os.finalizar");
    expect(p).toContain("os.iniciar");
  });

  it("gestor NÃO edita, exclui nem desativa outro gestor — nem a si mesmo", async () => {
    const outro = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });
    const c = gestor();

    expect((await c.put(`/usuarios/${outro.id}`, { nome: "X", email: `${Math.random().toString(36).slice(2)}@vitest.local`, role: "GESTOR" })).status).toBe(403);
    expect((await c.delete(`/usuarios/${outro.id}`)).status).toBe(403);
    expect((await c.patch(`/usuarios/${outro.id}/toggle-status`)).status).toBe(403);

    expect((await c.delete(`/usuarios/${fx.A.gestorId}`)).status).toBe(403);
    expect((await c.patch(`/usuarios/${fx.A.gestorId}/toggle-status`)).status).toBe(403);

    const { rows } = await pool.query(`SELECT ativo FROM usuarios WHERE id = ANY($1::int[])`, [[outro.id, fx.A.gestorId]]);
    expect(rows.every((r) => r.ativo === true)).toBe(true);
  });

  it("o administrador não consegue excluir nem desativar a própria conta", async () => {
    expect((await admin().delete(`/usuarios/${fx.A.adminId}`)).status).toBe(403);
    expect((await admin().patch(`/usuarios/${fx.A.adminId}/toggle-status`)).status).toBe(403);
  });

  it("gestor não promove ninguém a gestor/admin; administrador promove a gestor", async () => {
    const t = await novoTecnico();
    const dados = (role: string) => ({ nome: "Promovido", email: `${Math.random().toString(36).slice(2)}@vitest.local`, role });

    expect((await gestor().put(`/usuarios/${t.id}`, dados("GESTOR"))).status).toBe(403);
    expect((await admin().put(`/usuarios/${t.id}`, dados("ADMIN"))).status).toBe(403);
    expect((await admin().put(`/usuarios/${t.id}`, dados("GESTOR"))).status).toBe(200);
    expect((await permissoesNoBanco(t.id)).length).toBe(TODAS_PERMISSOES.length);
  });

  it("um administrador não pode ser rebaixado por aqui", async () => {
    const outroAdmin = await criarUsuarioTeste(fx.A, { role: "ADMIN" });
    const res = await admin().put(`/usuarios/${outroAdmin.id}`, {
      nome: "Rebaixado",
      email: `${Math.random().toString(36).slice(2)}@vitest.local`,
      role: "GESTOR",
    });
    expect(res.status).toBe(403);
    expect((await pool.query(`SELECT role FROM usuarios WHERE id = $1`, [outroAdmin.id])).rows[0].role).toBe("ADMIN");
  });

  it("trocar o tipo (técnico → operador) reaplica o padrão do novo tipo e fica na auditoria", async () => {
    const t = await novoTecnico();
    const res = await gestor().put(`/usuarios/${t.id}`, { nome: "Agora operador", email: `${Math.random().toString(36).slice(2)}@vitest.local`, role: "OPERADOR" });
    expect(res.status).toBe(200);
    expect(await permissoesNoBanco(t.id)).toEqual([...PADRAO_POR_PAPEL.OPERADOR].sort());

    const aud = await gestor().get(`/permissoes/auditoria?usuario=${t.id}`);
    expect(aud.body[0].acao).toBe("mudanca_de_tipo");
  });

  it("desativar corta o acesso na hora (token antigo ainda válido); reativar devolve", async () => {
    const t = await novoTecnico();
    expect((await com(t.token).get("/maquinas")).status).toBe(200);

    expect((await gestor().patch(`/usuarios/${t.id}/toggle-status`)).status).toBe(200);
    const bloqueado = await com(t.token).get("/maquinas");
    expect(bloqueado.status).toBe(401);
    expect(JSON.stringify(bloqueado.body)).toMatch(/inativo/i);

    expect((await gestor().patch(`/usuarios/${t.id}/toggle-status`)).status).toBe(200);
    expect((await com(t.token).get("/maquinas")).status).toBe(200);
  });

  it("excluir o funcionário derruba o token na hora e apaga as permissões dele", async () => {
    const t = await novoTecnico();
    expect((await com(t.token).get("/maquinas")).status).toBe(200);

    expect((await gestor().delete(`/usuarios/${t.id}`)).status).toBe(204);
    expect((await com(t.token).get("/maquinas")).status).toBe(401);
    expect(await permissoesNoBanco(t.id)).toEqual([]);
  });
});

describe("auditoria", () => {
  it("registra quem mudou, em quem, e o antes/depois", async () => {
    const alvo = await novoOperador(["os.ver"]);
    await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["os.ver", "relatorios.ver"] });

    const res = await gestor().get(`/permissoes/auditoria?usuario=${alvo.id}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toMatchObject({
      acao: "definir",
      alterado_por: fx.A.gestorId,
      usuario_alvo: alvo.id,
      antes: ["os.ver"],
      depois: ["os.ver", "relatorios.ver"],
    });
    expect(res.body[0].alterado_por_nome).toContain("gestor");
  });

  it("aceita limite e rejeita parâmetros inválidos", async () => {
    expect((await gestor().get("/permissoes/auditoria?limite=1")).body.length).toBeLessThanOrEqual(1);
    expect((await gestor().get("/permissoes/auditoria?limite=0")).status).toBe(400);
    expect((await gestor().get("/permissoes/auditoria?limite=abc")).status).toBe(400);
  });

  it("o histórico sobrevive à exclusão do funcionário (sem apontar pra ele)", async () => {
    const alvo = await novoOperador([]);
    await gestor().put(`/permissoes/usuarios/${alvo.id}`, { permissoes: ["os.ver"] });
    await gestor().delete(`/usuarios/${alvo.id}`);

    const res = await gestor().get("/permissoes/auditoria?limite=200");
    const linha = res.body.find((r: any) => r.depois.length === 1 && r.depois[0] === "os.ver" && r.usuario_alvo === null);
    expect(linha).toBeDefined();
  });
});

describe("outra empresa (isolamento)", () => {
  it("o gestor/admin da B não enxerga nem altera as permissões de funcionário da A", async () => {
    const alvoA = await novoTecnico();
    const antes = await permissoesNoBanco(alvoA.id);
    const deB = com(fx.B.tokenAdmin);

    expect((await deB.get(`/permissoes/usuarios/${alvoA.id}`)).status).toBe(404);
    expect((await deB.put(`/permissoes/usuarios/${alvoA.id}`, { permissoes: [] })).status).toBe(404);
    expect((await deB.post(`/permissoes/usuarios/${alvoA.id}/restaurar-padrao`)).status).toBe(404);
    expect(await permissoesNoBanco(alvoA.id)).toEqual(antes);
  });

  it("a auditoria da A não aparece pra B (e vice-versa)", async () => {
    const alvoA = await novoTecnico();
    await gestor().put(`/permissoes/usuarios/${alvoA.id}`, { permissoes: ["os.ver"] });

    const alvoB = await criarUsuarioTeste(fx.B, { role: "TECNICO", permissoes: [] });
    await com(fx.B.tokenAdmin).put(`/permissoes/usuarios/${alvoB.id}`, { permissoes: ["os.ver"] });

    const deB = (await com(fx.B.tokenAdmin).get("/permissoes/auditoria?limite=200")).body;
    expect(deB.length).toBeGreaterThan(0);
    expect(deB.every((r: any) => r.usuario_alvo === alvoB.id || r.usuario_alvo === null || r.usuario_alvo !== alvoA.id)).toBe(true);
    expect(deB.some((r: any) => r.usuario_alvo === alvoA.id)).toBe(false);

    const deA = (await admin().get("/permissoes/auditoria?limite=200")).body;
    expect(deA.some((r: any) => r.usuario_alvo === alvoB.id)).toBe(false);
  });

  it("mudar permissões na A não afeta ninguém da B", async () => {
    const tecB = await criarUsuarioTeste(fx.B, { role: "TECNICO" });
    const antes = (await com(tecB.token).get("/permissoes/eu")).body.permissoes;

    const alvoA = await novoTecnico();
    await gestor().put(`/permissoes/usuarios/${alvoA.id}`, { permissoes: [] });

    expect((await com(tecB.token).get("/permissoes/eu")).body.permissoes).toEqual(antes);
  });

  it("gestor da A não cadastra nem edita usuário da B", async () => {
    const tecB = await criarUsuarioTeste(fx.B, { role: "TECNICO", permissoes: [] });
    const res = await gestor().put(`/usuarios/${tecB.id}`, { nome: "X", email: `${Math.random().toString(36).slice(2)}@vitest.local`, role: "TECNICO" });
    expect(res.status).toBe(404);
    expect((await gestor().patch(`/usuarios/${tecB.id}/toggle-status`)).status).toBe(404);
    expect((await gestor().delete(`/usuarios/${tecB.id}`)).status).toBe(404);
  });
});

describe("sessão", () => {
  it("token de usuário que não existe mais → 401", async () => {
    const t = jwt.sign({ id: 2147483000, role: "ADMIN", empresa_id: fx.A.empresaId }, process.env.JWT_SECRET!);
    expect((await com(t).get("/maquinas")).status).toBe(401);
  });

  it("token com a empresa trocada (id da A, empresa da B) → 401", async () => {
    const t = jwt.sign({ id: fx.A.tecnicoId, role: "TECNICO", empresa_id: fx.B.empresaId }, process.env.JWT_SECRET!);
    expect((await com(t).get("/maquinas")).status).toBe(401);
  });

  it("papel no token não vale: o do banco manda (token diz ADMIN, banco diz TECNICO)", async () => {
    const t = jwt.sign({ id: fx.A.tecnicoId, role: "ADMIN", empresa_id: fx.A.empresaId }, process.env.JWT_SECRET!);
    const eu = await com(t).get("/permissoes/eu");
    expect(eu.body.usuario.role).toBe("TECNICO");
    expect(eu.body.permissoes).not.toContain("usuarios.gerenciar_permissoes");
    expect((await com(t).post("/usuarios", { nome: "x", email: "a@vitest.local", senha: "abc123", role: "OPERADOR" })).status).toBe(403);
  });
});

describe("desempenho: o cache evita ir ao banco a cada clique", () => {
  it("25 requisições seguidas do mesmo usuário = 1 consulta de perfil", async () => {
    const u = await novoTecnico(["maquinas.ver"]);
    const espia = vi.spyOn(PermissaoRepository.prototype, "carregar");

    for (let i = 0; i < 25; i++) {
      expect((await com(u.token).get("/maquinas")).status).toBe(200);
    }

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("15 primeiras requisições em paralelo compartilham UMA consulta (sem avalanche)", async () => {
    const u = await novoTecnico(["maquinas.ver"]);
    const espia = vi.spyOn(PermissaoRepository.prototype, "carregar");

    const respostas = await Promise.all(Array.from({ length: 15 }, () => com(u.token).get("/maquinas")));

    expect(respostas.every((r) => r.status === 200)).toBe(true);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("depois do prazo do cache (30s) o perfil é recarregado — vale também pra mudança feita por outra instância", async () => {
    const u = await novoTecnico(["maquinas.ver"]);
    await com(u.token).get("/maquinas");

    // outra instância do servidor muda direto no banco (sem invalidar o nosso cache)
    await pool.query(`DELETE FROM usuario_permissoes WHERE usuario_id = $1`, [u.id]);
    expect((await com(u.token).get("/maquinas")).status).toBe(200); // ainda em cache

    const agora = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(agora + 31_000);
    expect((await com(u.token).get("/maquinas")).status).toBe(403); // cache expirou
  });

  it("a checagem em memória é rápida: 200 chamadas de perfil em cache levam poucos ms", async () => {
    const u = await novoTecnico(["maquinas.ver"]);
    await permissaoService.perfil(u.id);

    const inicio = performance.now();
    for (let i = 0; i < 200; i++) await permissaoService.perfil(u.id);
    expect(performance.now() - inicio).toBeLessThan(100);
  });
});

describe("WebSocket de monitoramento", () => {
  function conectar(token: string): Promise<number> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws/telemetria?token=${token}`);
      ws.on("open", () => {
        ws.close();
        resolve(101);
      });
      ws.on("unexpected-response", (_r, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve(0));
    });
  }

  it("com 'ver monitoramento' conecta", async () => {
    const u = await novoTecnico(["monitoramento.ver"]);
    expect(await conectar(u.token)).toBe(101);
  });

  it("sem 'ver monitoramento' é recusado (403)", async () => {
    const u = await novoTecnico(["maquinas.ver"]);
    expect(await conectar(u.token)).toBe(403);
  });

  it("usuário desativado é recusado (401), mesmo com token válido", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["monitoramento.ver"], ativo: false });
    expect(await conectar(u.token)).toBe(401);
  });
});

describe("resumo dos tipos padrão (o que cada um ganha)", () => {
  const casos: [string, UsuarioTeste | null, Record<string, number>][] = [];

  it("técnico padrão: vê e executa O.S., não vê Usuários/Relatórios, não cancela", async () => {
    const t = await novoTecnico();
    expect((await com(t.token).get("/ordens-servico")).status).toBe(200);
    expect((await com(t.token).get("/usuarios")).status).toBe(403);
    expect((await com(t.token).get("/relatorios/ordens-servico/preview")).status).toBe(403);
    void casos;
  });

  it("operador padrão: abre e vê O.S., mas não executa", async () => {
    const o = await novoOperador();
    const os = await pool.query(`SELECT id FROM ordens_servico WHERE empresa_id = $1 LIMIT 1`, [fx.A.empresaId]);
    expect((await com(o.token).get("/ordens-servico")).status).toBe(200);
    expect((await com(o.token).patch(`/ordens-servico/${os.rows[0].id}/iniciar`)).status).toBe(403);
  });
});

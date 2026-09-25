import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import request from "supertest";
import WebSocket from "ws";
import { app } from "../src/app";
import { initTelemetriaRealtime } from "../src/realtime/telemetriaRealtime";
import { limitadorDeTrocaDeSenha } from "../src/middlewares/rateLimitMiddleware";
import { permissaoService } from "../src/services/PermissaoService";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture, Lado } from "./helpers/fixture";

/**
 * "Trocar minha senha" (qualquer perfil, dentro do sistema). Pontos críticos: só a própria conta muda,
 * exige a senha atual, e trocar a senha ENCERRA as outras sessões (token antigo, outro aparelho, tempo real).
 */

let fx: Fixture;
let server: http.Server;
let porta: number;

const ATUAL = "Senha@123";
const NOVA = "NovaSenha@456";

const com = (token: string) => (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
const trocar = (token: string, corpo: unknown) => com(token)(request(app).patch("/conta/senha")).send(corpo as object);
const entrar = (email: string, senha: string) => request(app).post("/auth/login").send({ email, senha });

/** Usuário novo com senha de verdade (as da fixture são reaproveitadas por outros testes). */
async function novoUsuario(lado: Lado, role: string) {
  const u = await criarUsuarioTeste(lado, { role });
  await pool.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [await bcrypt.hash(ATUAL, 4), u.id]);
  return u;
}

const linha = async (id: number) =>
  (await pool.query(`SELECT senha, versao_sessao, deve_trocar_senha FROM usuarios WHERE id = $1`, [id])).rows[0];

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

describe("todos os perfis trocam a própria senha", () => {
  it.each(["GESTOR", "TECNICO", "OPERADOR", "ADMIN"])("%s: troca, entra com a nova e a antiga deixa de valer", async (role) => {
    const u = await novoUsuario(fx.A, role);
    const antes = await linha(u.id);

    const res = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["token"]);
    expect(JSON.stringify(res.body)).not.toContain(NOVA);

    const depois = await linha(u.id);
    expect(depois.versao_sessao).toBe(antes.versao_sessao + 1);
    expect(depois.senha).not.toContain(NOVA);
    expect(depois.senha).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(NOVA, depois.senha)).toBe(true);
    expect(await bcrypt.compare(ATUAL, depois.senha)).toBe(false);

    const login = await entrar(u.email, NOVA);
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe(role);
  });

  it("o token novo continua a mesma pessoa, no mesmo perfil e na mesma empresa", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const { body } = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    const dados = jwt.verify(body.token, process.env.JWT_SECRET!) as any;

    expect(dados).toMatchObject({ id: u.id, role: "GESTOR", empresa_id: fx.A.empresaId, sv: 1 });
    expect((await com(body.token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it("o login novo já nasce com a versão da sessão atual", async () => {
    const u = await novoUsuario(fx.A, "TECNICO");
    await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });

    const login = await entrar(u.email, NOVA);
    expect((jwt.verify(login.body.token, process.env.JWT_SECRET!) as any).sv).toBe(1);
    expect((await com(login.body.token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it("trocar a senha de novo continua funcionando (com o token novo)", async () => {
    const u = await novoUsuario(fx.A, "OPERADOR");
    const primeira = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    const segunda = await trocar(primeira.body.token, { senha_atual: NOVA, nova_senha: "Outra@Senha789" });

    expect(segunda.status).toBe(200);
    expect((await linha(u.id)).versao_sessao).toBe(2);
    expect((await entrar(u.email, "Outra@Senha789")).status).toBe(200);
  });
});

describe("trocar a senha encerra as outras sessões", () => {
  it("o token antigo é recusado em toda rota (inclusive nas de troca de senha)", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const { body } = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });

    for (const [metodo, url] of [["get", "/maquinas"], ["get", "/usuarios"], ["get", "/permissoes/eu"], ["get", "/ordens-servico"]] as const) {
      const res = await com(u.token)((request(app) as any)[metodo](url));
      expect(res.status, url).toBe(401);
      expect(res.body.codigo).toBe("SESSAO_ENCERRADA");
    }

    // e o token antigo não serve nem para trocar a senha de novo
    expect((await trocar(u.token, { senha_atual: NOVA, nova_senha: "Outra@Senha789" })).status).toBe(401);
    expect((await com(body.token)(request(app).get("/maquinas"))).status).toBe(200);
  });

  it("outro aparelho já logado (segunda sessão) cai quando a senha é trocada na primeira", async () => {
    const u = await novoUsuario(fx.A, "TECNICO");
    const celular = (await entrar(u.email, ATUAL)).body.token;
    const computador = (await entrar(u.email, ATUAL)).body.token;

    expect((await com(celular)(request(app).get("/permissoes/eu"))).status).toBe(200);
    expect((await com(computador)(request(app).get("/permissoes/eu"))).status).toBe(200);

    const troca = await trocar(computador, { senha_atual: ATUAL, nova_senha: NOVA });
    expect(troca.status).toBe(200);

    expect((await com(celular)(request(app).get("/permissoes/eu"))).status).toBe(401);
    expect((await com(computador)(request(app).get("/permissoes/eu"))).status).toBe(401);
    expect((await com(troca.body.token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it("token de antes desta funcionalidade (sem versão) vale até a troca e depois não", async () => {
    const u = await novoUsuario(fx.A, "OPERADOR");
    const legado = jwt.sign({ id: u.id, role: "OPERADOR", empresa_id: fx.A.empresaId }, process.env.JWT_SECRET!, { expiresIn: "1h" });

    expect((await com(legado)(request(app).get("/permissoes/eu"))).status).toBe(200);
    await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    expect((await com(legado)(request(app).get("/permissoes/eu"))).status).toBe(401);
  });

  it("token com versão que não é a do banco (adiantada ou atrasada) é recusado", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const comVersao = (sv: number) => jwt.sign({ id: u.id, role: "GESTOR", empresa_id: fx.A.empresaId, sv }, process.env.JWT_SECRET!, { expiresIn: "1h" });

    expect((await com(comVersao(0))(request(app).get("/permissoes/eu"))).status).toBe(200);
    expect((await com(comVersao(1))(request(app).get("/permissoes/eu"))).status).toBe(401);
    expect((await com(comVersao(999))(request(app).get("/permissoes/eu"))).status).toBe(401);
    expect((await com(comVersao(-1))(request(app).get("/permissoes/eu"))).status).toBe(401);
  });

  it("tempo real: a conexão aberta cai e o token antigo não reconecta; o novo sim", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");

    const abrir = (token: string) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws/telemetria?token=${token}`);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
        ws.on("unexpected-response", (_r, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      });

    const aberta = await abrir(u.token);
    const fechou = new Promise<number>((ok) => aberta.on("close", (codigo) => ok(codigo)));

    const troca = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    expect(troca.status).toBe(200);

    expect(await Promise.race([fechou, new Promise<number>((ok) => setTimeout(() => ok(-1), 5000))])).not.toBe(-1);
    await expect(abrir(u.token)).rejects.toThrow("HTTP 401");

    const nova = await abrir(troca.body.token);
    nova.close();
  });
});

describe("senha atual e regras da senha nova", () => {
  it("senha atual errada: recusa, não muda nada e a sessão continua", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const antes = await linha(u.id);

    const res = await trocar(u.token, { senha_atual: "errada@123", nova_senha: NOVA });

    expect(res.status).toBe(400);
    expect(String(res.body.message ?? res.body.error)).toMatch(/senha atual/i);
    expect(JSON.stringify(res.body)).not.toContain(NOVA);
    expect(await linha(u.id)).toEqual(antes);
    expect((await com(u.token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it("uma sessão esquecida aberta não basta: sem a senha atual ninguém troca", async () => {
    const u = await novoUsuario(fx.A, "OPERADOR");
    for (const corpo of [{ nova_senha: NOVA }, { senha_atual: "", nova_senha: NOVA }, { senha_atual: null, nova_senha: NOVA }]) {
      expect((await trocar(u.token, corpo)).status).toBe(400);
    }
    expect(await bcrypt.compare(ATUAL, (await linha(u.id)).senha)).toBe(true);
  });

  it.each([
    ["curta (7)", "Ab1cdef"],
    ["sem número", "SomenteLetrasAqui"],
    ["sem letra", "1234567890"],
    ["igual à atual", ATUAL],
    ["vazia", ""],
    ["73 caracteres (o bcrypt ignoraria o fim)", "Ab1" + "x".repeat(70)],
    ["74 bytes com acentos", "Ab1" + "é".repeat(36)],
  ])("nova senha recusada: %s", async (_n, nova) => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const antes = await linha(u.id);

    const res = await trocar(u.token, { senha_atual: ATUAL, nova_senha: nova });

    expect(res.status).toBe(400);
    expect((await linha(u.id)).senha).toBe(antes.senha);
    expect((await com(u.token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it.each([
    ["número no lugar do texto", { senha_atual: ATUAL, nova_senha: 12345678 }],
    ["lista", { senha_atual: ATUAL, nova_senha: ["Abc12345"] }],
    ["objeto", { senha_atual: ATUAL, nova_senha: { $ne: "" } }],
    ["senha atual em objeto (injeção)", { senha_atual: { $ne: "" }, nova_senha: NOVA }],
    ["corpo vazio", {}],
  ])("formato inválido: %s (400)", async (_n, corpo) => {
    const u = await novoUsuario(fx.A, "TECNICO");
    expect((await trocar(u.token, corpo)).status).toBe(400);
    expect((await linha(u.id)).versao_sessao).toBe(0);
  });

  it("exatamente 72 caracteres é aceita e vale por inteiro", async () => {
    const u = await novoUsuario(fx.A, "TECNICO");
    const nova = "Ab1" + "x".repeat(69);

    expect(nova).toHaveLength(72);
    expect((await trocar(u.token, { senha_atual: ATUAL, nova_senha: nova })).status).toBe(200);
    expect((await entrar(u.email, nova)).status).toBe(200);
  });

  it("senha com espaços, símbolos e acentos é aceita", async () => {
    const u = await novoUsuario(fx.A, "OPERADOR");
    const nova = "Sénha forte #1 ção";

    expect((await trocar(u.token, { senha_atual: ATUAL, nova_senha: nova })).status).toBe(200);
    expect((await entrar(u.email, nova)).status).toBe(200);
  });
});

describe("só a própria conta, sempre dentro da própria empresa", () => {
  it("o corpo não escolhe de quem é a senha (id, e-mail e empresa enviados são ignorados)", async () => {
    const eu = await novoUsuario(fx.A, "TECNICO");
    const colega = await novoUsuario(fx.A, "GESTOR");
    const deOutraEmpresa = await novoUsuario(fx.B, "GESTOR");
    const antesColega = await linha(colega.id);
    const antesOutra = await linha(deOutraEmpresa.id);

    const res = await trocar(eu.token, {
      senha_atual: ATUAL,
      nova_senha: NOVA,
      id: colega.id,
      usuario_id: deOutraEmpresa.id,
      email: colega.email,
      empresa_id: fx.B.empresaId,
    });

    expect(res.status).toBe(200);
    expect(await bcrypt.compare(NOVA, (await linha(eu.id)).senha)).toBe(true);
    expect(await linha(colega.id)).toEqual(antesColega);
    expect(await linha(deOutraEmpresa.id)).toEqual(antesOutra);
  });

  it("não existe rota para trocar a senha de outra pessoa", async () => {
    const colega = await novoUsuario(fx.A, "OPERADOR");
    const antes = await linha(colega.id);

    for (const [metodo, url] of [
      ["patch", `/conta/${colega.id}/senha`],
      ["patch", `/usuarios/${colega.id}/senha`],
      ["put", `/usuarios/${colega.id}/senha`],
      ["post", `/conta/senha/${colega.id}`],
    ] as const) {
      const res = await com(fx.A.tokenGestor)((request(app) as any)[metodo](url)).send({ senha_atual: ATUAL, nova_senha: NOVA });
      expect([404, 405], `${metodo} ${url}`).toContain(res.status);
    }
    expect(await linha(colega.id)).toEqual(antes);
  });

  it("nem o gestor nem o admin trocam a senha de um colega editando o cadastro dele", async () => {
    const colega = await novoUsuario(fx.A, "TECNICO");
    const antes = await linha(colega.id);

    for (const token of [fx.A.tokenGestor, fx.A.tokenAdmin]) {
      await com(token)(request(app).put(`/usuarios/${colega.id}`)).send({ nome: "Colega", email: colega.email, role: "TECNICO", senha: "Hackeada@1" });
    }
    expect(await bcrypt.compare("Hackeada@1", (await linha(colega.id)).senha)).toBe(false);
    expect((await linha(colega.id)).senha).toBe(antes.senha);
  });

  it("o hash de um usuário nunca aparece em resposta nenhuma da troca", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const res = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });
});

describe("quem não pode nem chegar na troca", () => {
  it("sem token, token inválido, adulterado, expirado ou de outra chave: 401", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const expirado = jwt.sign({ id: u.id, role: "GESTOR", empresa_id: fx.A.empresaId, sv: 0 }, process.env.JWT_SECRET!, { expiresIn: -10 });
    const outraChave = jwt.sign({ id: u.id, role: "GESTOR", empresa_id: fx.A.empresaId, sv: 0 }, "chave-errada", { expiresIn: "1h" });

    const corpo = { senha_atual: ATUAL, nova_senha: NOVA };
    expect((await request(app).patch("/conta/senha").send(corpo)).status).toBe(401);
    for (const token of ["lixo", u.token.slice(0, -3) + "abc", expirado, outraChave]) {
      expect((await trocar(token, corpo)).status).toBe(401);
    }
    expect(await bcrypt.compare(ATUAL, (await linha(u.id)).senha)).toBe(true);
  });

  it("token com a empresa trocada: sessão inválida (401)", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    const trocado = jwt.sign({ id: u.id, role: "GESTOR", empresa_id: fx.B.empresaId, sv: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });

    expect((await trocar(trocado, { senha_atual: ATUAL, nova_senha: NOVA })).status).toBe(401);
    expect(await bcrypt.compare(ATUAL, (await linha(u.id)).senha)).toBe(true);
  });

  it("usuário desativado não troca senha (401)", async () => {
    const u = await novoUsuario(fx.A, "OPERADOR");
    await pool.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [u.id]);
    permissaoService.invalidar(u.id);

    expect((await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA })).status).toBe(401);
    expect(await bcrypt.compare(ATUAL, (await linha(u.id)).senha)).toBe(true);
  });

  it("empresa inativada não troca senha (401) e, reativada, volta a poder", async () => {
    const u = await novoUsuario(fx.B, "GESTOR");

    await pool.query(`UPDATE empresas SET ativo = false WHERE id = $1`, [fx.B.empresaId]);
    permissaoService.invalidarEmpresa(fx.B.empresaId);
    try {
      expect((await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA })).status).toBe(401);
      expect(await bcrypt.compare(ATUAL, (await linha(u.id)).senha)).toBe(true);
    } finally {
      await pool.query(`UPDATE empresas SET ativo = true WHERE id = $1`, [fx.B.empresaId]);
      permissaoService.invalidarEmpresa(fx.B.empresaId);
    }

    expect((await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA })).status).toBe(200);
  });
});

describe("primeiro acesso (senha temporária) continua funcionando", () => {
  it("quem tem senha temporária troca pela mesma rota e o sistema libera com o token novo", async () => {
    const u = await novoUsuario(fx.A, "GESTOR");
    await pool.query(`UPDATE usuarios SET deve_trocar_senha = true WHERE id = $1`, [u.id]);
    permissaoService.invalidar(u.id);

    const bloqueado = await com(u.token)(request(app).get("/maquinas"));
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.codigo).toBe("TROCAR_SENHA");

    const troca = await trocar(u.token, { senha_atual: ATUAL, nova_senha: NOVA });
    expect(troca.status).toBe(200);
    expect((await linha(u.id)).deve_trocar_senha).toBe(false);
    expect((await com(troca.body.token)(request(app).get("/maquinas"))).status).toBe(200);
  });
});

describe("limite de tentativas (ninguém adivinha a senha atual)", () => {
  it("passou do limite: 429 mesmo com o token certo; cada usuário tem o seu contador", async () => {
    const mini = express();
    mini.use(express.json());
    mini.use((req, _res, next) => {
      (req as any).user = { id: Number(req.headers["x-user"] ?? 1) };
      next();
    });
    mini.patch("/senha", limitadorDeTrocaDeSenha(3, 60_000), (_req, res) => res.status(400).json({ error: "senha atual incorreta" }));

    const tentar = (usuario: number) => request(mini).patch("/senha").set("x-user", String(usuario));

    // erros também contam: é justamente quem erra a senha que precisa ser freado
    for (let i = 0; i < 3; i++) expect((await tentar(1)).status).toBe(400);
    expect((await tentar(1)).status).toBe(429);
    expect((await tentar(2)).status).toBe(400);
  });

  it("o limitador está ligado na rota real (avisa o limite nos cabeçalhos)", async () => {
    const u = await novoUsuario(fx.A, "TECNICO");
    const res = await trocar(u.token, { senha_atual: "errada@123", nova_senha: NOVA });
    expect(res.headers["ratelimit-limit"] ?? res.headers["ratelimit"]).toBeDefined();
  });
});

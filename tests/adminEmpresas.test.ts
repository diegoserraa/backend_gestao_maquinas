import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { MaquinaRepository } from "../src/repositories/MaquinaRepository";
import { limitadorDeCriacaoAdmin } from "../src/middlewares/rateLimitMiddleware";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, PREFIXO, Fixture } from "./helpers/fixture";

/**
 * Painel do administrador (dono do sistema): cadastrar empresas (identificação e cobrança), editar e
 * inativar. Esta é a camada MAIS sensível do sistema: só o administrador entra, e o painel nunca lê
 * dados de operação do cliente. O foco dos testes é o acesso e o isolamento.
 */

let fx: Fixture;

const comoAdmin = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const com = (token: string) => (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

const sufixo = () => Math.random().toString(36).slice(2, 8);

/** CNPJ válido aleatório (implementação independente da do servidor, para conferir os dois). */
function cnpjAleatorio(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const dv = (digs: number[], pesos: number[]) => {
    const r = digs.reduce((s, d, i) => s + d * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

const mascara = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const corpoValido = (extra: Record<string, unknown> = {}, gestorExtra: Record<string, unknown> = {}) => ({
  nome: `${PREFIXO}painel_${sufixo()}`,
  razao_social: "Painel Indústria LTDA",
  cnpj: mascara(cnpjAleatorio()),
  telefone: "(11) 91234-5678",
  email_cobranca: `cobranca_${sufixo()}@vitest.local`,
  cidade: "São Paulo",
  uf: "sp",
  plano: "BASICO",
  inicio_contrato: "2026-03-01",
  observacoes: "Piloto com desconto",
  gestor: { nome: "Gestora Nova", email: `${PREFIXO.toLowerCase()}gestor_${sufixo()}@vitest.local`, telefone: "11987654321", ...gestorExtra },
  ...extra,
});

async function criarEmpresa(extra: Record<string, unknown> = {}, gestorExtra: Record<string, unknown> = {}) {
  const corpo = corpoValido(extra, gestorExtra);
  const res = await comoAdmin(request(app).post("/admin/empresas")).send(corpo);
  return { res, corpo };
}

async function entrar(email: string, senha: string) {
  return request(app).post("/auth/login").send({ email, senha });
}

// dados de operação que o painel NUNCA deve devolver
const CHAVES_OPERACIONAIS = [
  "usuarios_total", "usuarios_ativos", "maquinas_total", "maquinas_monitoradas", "os_em_aberto",
  "por_perfil", "os", "ultima_telemetria", "usuarios", "janela_monitoramento_horas",
];

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("acesso: só o administrador (dono do sistema)", () => {
  const ID = "00000000-0000-0000-0000-000000000000";
  const rotas: [string, string, object?][] = [
    ["get", "/admin/empresas"],
    ["get", `/admin/empresas/${ID}`],
    ["post", "/admin/empresas", { nome: "X" }],
    ["patch", `/admin/empresas/${ID}`, { nome: "X" }],
    ["patch", `/admin/empresas/${ID}/situacao`, { ativo: false }],
  ];

  it("sem token: 401 em todas as rotas", async () => {
    for (const [metodo, url, corpo] of rotas) {
      const res = await (request(app) as any)[metodo](url).send(corpo);
      expect(res.status, `${metodo} ${url}`).toBe(401);
    }
  });

  it.each([
    ["gestor", () => fx.A.tokenGestor],
    ["técnico", () => fx.A.tokenTecnico],
    ["operador", () => fx.A.tokenOperador],
  ])("%s recebe 403 em todas as rotas (mesmo sendo gestor da própria empresa)", async (_n, token) => {
    for (const [metodo, url, corpo] of rotas) {
      const res = await (request(app) as any)[metodo](url).set("Authorization", `Bearer ${token()}`).send(corpo);
      expect(res.status, `${metodo} ${url}`).toBe(403);
    }
  });

  it("token FORJADO dizendo 'ADMIN' para um gestor: o perfil vem do banco, não do token (403)", async () => {
    const forjado = jwt.sign({ id: fx.A.gestorId, role: "ADMIN", empresa_id: fx.A.empresaId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
    for (const [metodo, url, corpo] of rotas) {
      const res = await (request(app) as any)[metodo](url).set("Authorization", `Bearer ${forjado}`).send(corpo);
      expect(res.status, `${metodo} ${url}`).toBe(403);
    }
  });

  it("token com empresa trocada (id de gestor + empresa da outra): sessão inválida (401)", async () => {
    const trocado = jwt.sign({ id: fx.A.gestorId, role: "ADMIN", empresa_id: fx.B.empresaId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
    expect((await com(trocado)(request(app).get("/admin/empresas"))).status).toBe(401);
  });

  it("token assinado com outra chave, adulterado ou expirado: 401", async () => {
    const outraChave = jwt.sign({ id: fx.A.adminId, role: "ADMIN", empresa_id: fx.A.empresaId }, "chave-errada", { expiresIn: "1h" });
    const expirado = jwt.sign({ id: fx.A.adminId, role: "ADMIN", empresa_id: fx.A.empresaId }, process.env.JWT_SECRET!, { expiresIn: -10 });
    const adulterado = fx.A.tokenAdmin.slice(0, -3) + "abc";

    for (const token of [outraChave, expirado, adulterado, "lixo", ""]) {
      expect((await com(token)(request(app).get("/admin/empresas"))).status).toBe(401);
    }
  });

  it("administrador desativado perde o acesso ao painel na hora (mesmo com token válido)", async () => {
    const adminInativo = await criarUsuarioTeste(fx.A, { role: "ADMIN", permissoes: [], ativo: false });
    expect((await com(adminInativo.token)(request(app).get("/admin/empresas"))).status).toBe(401);
  });

  it("um usuário apagado não acessa (token ainda válido)", async () => {
    const admin = await criarUsuarioTeste(fx.A, { role: "ADMIN", permissoes: [] });
    expect((await com(admin.token)(request(app).get("/admin/empresas"))).status).toBe(200);
    await pool.query(`DELETE FROM usuarios WHERE id = $1`, [admin.id]);
    // o cache do perfil vale até 30s: força a leitura nova como acontece quando expira
    const { permissaoService } = await import("../src/services/PermissaoService");
    permissaoService.invalidar(admin.id);
    expect((await com(admin.token)(request(app).get("/admin/empresas"))).status).toBe(401);
  });

  it("ninguém consegue virar administrador pela API (criar ou promover)", async () => {
    const criar = await com(fx.A.tokenGestor)(request(app).post("/usuarios")).send({ nome: "Falso Admin", email: `falso_${sufixo()}@vitest.local`, senha: "Senha123", role: "ADMIN" });
    expect([400, 403]).toContain(criar.status);

    const promover = await com(fx.A.tokenGestor)(request(app).put(`/usuarios/${fx.A.tecnicoId}`)).send({ nome: "Promovido", email: `promovido_${sufixo()}@vitest.local`, role: "ADMIN" });
    expect([400, 403]).toContain(promover.status);
    expect((await pool.query(`SELECT role FROM usuarios WHERE id = $1`, [fx.A.tecnicoId])).rows[0].role).toBe("TECNICO");
  });

  it("o administrador acessa", async () => {
    expect((await comoAdmin(request(app).get("/admin/empresas"))).status).toBe(200);
  });

  it("id que não é um UUID nem chega ao banco (404)", async () => {
    for (const id of ["abc", "1", "1' OR '1'='1", "../../etc/passwd"]) {
      expect((await comoAdmin(request(app).get(`/admin/empresas/${encodeURIComponent(id)}`))).status, id).toBe(404);
    }
  });

  it("empresa que não existe: 404", async () => {
    expect((await comoAdmin(request(app).get(`/admin/empresas/${ID}`))).status).toBe(404);
  });
});

describe("o painel não entra na operação do cliente", () => {
  it("a lista traz só identificação e cobrança, sem nenhum número operacional", async () => {
    const res = await comoAdmin(request(app).get("/admin/empresas"));
    const a = res.body.empresas.find((e: any) => e.id === fx.A.empresaId);

    expect(a).toBeDefined();
    for (const chave of CHAVES_OPERACIONAIS) expect(a, chave).not.toHaveProperty(chave);
    expect(Object.keys(res.body)).toEqual(["empresas"]);
    expect(a).toHaveProperty("nome");
    expect(a).toHaveProperty("ativo");
    expect(a).toHaveProperty("ultimo_acesso");
  });

  it("o detalhe mostra os gestores (para saber com quem falar) e nada de máquinas, O.S. ou outros usuários", async () => {
    const res = await comoAdmin(request(app).get(`/admin/empresas/${fx.A.empresaId}`));
    expect(res.status).toBe(200);

    for (const chave of CHAVES_OPERACIONAIS) expect(res.body, chave).not.toHaveProperty(chave);

    const texto = JSON.stringify(res.body);
    expect(res.body.gestores).toHaveLength(1);
    expect(res.body.gestores[0].email).toContain("gestor@vitest.local");
    // técnicos, operadores e o administrador da fixture não aparecem
    expect(texto).not.toContain("_tecnico");
    expect(texto).not.toContain("_operador");
    expect(texto).not.toContain(fx.A.adminEmail);
  });

  it("o detalhe da empresa A não traz nada da B", async () => {
    const texto = JSON.stringify((await comoAdmin(request(app).get(`/admin/empresas/${fx.A.empresaId}`))).body);
    expect(texto).toContain(fx.A.marcador);
    expect(texto).not.toContain(fx.B.marcador);
  });

  it("nunca devolve o hash da senha", async () => {
    const lista = JSON.stringify((await comoAdmin(request(app).get("/admin/empresas"))).body);
    const detalhe = JSON.stringify((await comoAdmin(request(app).get(`/admin/empresas/${fx.A.empresaId}`))).body);
    for (const texto of [lista, detalhe]) expect(texto).not.toMatch(/"senha"|\$2[aby]\$/i);
  });

  it("o último acesso aparece depois de um login", async () => {
    const login = await entrar(`${fx.A.marcador.toLowerCase()}_gestor@vitest.local`, "Teste@123");
    expect(login.status).toBe(200);

    const res = await comoAdmin(request(app).get(`/admin/empresas/${fx.A.empresaId}`));
    expect(res.body.empresa.ultimo_acesso).not.toBeNull();
  });
});

describe("cadastrar empresa (identificação e cobrança + primeiro gestor)", () => {
  it("cria com todos os dados e devolve a senha temporária UMA vez", async () => {
    const { res, corpo } = await criarEmpresa();

    expect(res.status).toBe(201);
    expect(res.body.empresa.nome).toBe(corpo.nome);
    expect(res.body.empresa.ativo).toBe(true);
    expect(res.body.gestor).toMatchObject({ email: corpo.gestor.email, role: "GESTOR" });
    expect(res.body.senha_temporaria).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(res.body.senha_temporaria).toMatch(/\d/);
    expect(res.body.senha_temporaria).toMatch(/[A-Za-z]/);

    const { rows } = await pool.query(
      `SELECT nome, razao_social, cnpj, sem_cnpj, telefone, email_cobranca, cidade, uf, plano,
              to_char(inicio_contrato,'YYYY-MM-DD') inicio, observacoes, criada_por
         FROM empresas WHERE id = $1`,
      [res.body.empresa.id]
    );
    const e = rows[0];
    expect(e.cnpj).toBe(String(corpo.cnpj).replace(/\D/g, "")); // só dígitos no banco
    expect(e.razao_social).toBe("Painel Indústria LTDA");
    expect(e.telefone).toBe("11912345678");
    expect(e.uf).toBe("SP"); // maiúscula
    expect(e.plano).toBe("BASICO");
    expect(e.inicio).toBe("2026-03-01");
    expect(e.sem_cnpj).toBe(false);
    expect(e.criada_por).toBe(fx.A.adminId);

    const g = (await pool.query(`SELECT senha, role, deve_trocar_senha, empresa_id, telefone FROM usuarios WHERE email = $1`, [corpo.gestor.email])).rows[0];
    expect(g.senha).not.toContain(res.body.senha_temporaria);
    expect(g.role).toBe("GESTOR");
    expect(g.deve_trocar_senha).toBe(true);
    expect(g.empresa_id).toBe(res.body.empresa.id);
    expect(g.telefone).toBe("11987654321");

    // depois disso, a senha não é devolvida em lugar nenhum
    const detalhe = await comoAdmin(request(app).get(`/admin/empresas/${res.body.empresa.id}`));
    expect(JSON.stringify(detalhe.body)).not.toContain(res.body.senha_temporaria);
    expect(detalhe.body.empresa.cnpj).toBe(e.cnpj);
    expect(detalhe.body.empresa.inicio_contrato).toBe("2026-03-01");
  });

  it("só o nome, o CNPJ e o gestor bastam (o resto é opcional)", async () => {
    const res = await comoAdmin(request(app).post("/admin/empresas")).send({
      nome: `${PREFIXO}minima_${sufixo()}`,
      cnpj: cnpjAleatorio(),
      gestor: { nome: "Gestor", email: `${PREFIXO.toLowerCase()}min_${sufixo()}@vitest.local` },
    });
    expect(res.status).toBe(201);
  });

  it("cada empresa criada tem senha diferente", async () => {
    const a = await criarEmpresa();
    const b = await criarEmpresa();
    expect(a.res.body.senha_temporaria).not.toBe(b.res.body.senha_temporaria);
  });

  it("a criação fica registrada na auditoria (quem, o quê, qual empresa)", async () => {
    const { res } = await criarEmpresa();
    const { rows } = await pool.query(`SELECT admin_id, acao, detalhes FROM auditoria_admin WHERE empresa_id = $1`, [res.body.empresa.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].admin_id).toBe(fx.A.adminId);
    expect(rows[0].acao).toBe("criar_empresa");
    expect(JSON.stringify(rows[0].detalhes)).not.toContain(res.body.senha_temporaria);
  });

  it.each([
    ["sem corpo", () => ({})],
    ["nome vazio", () => corpoValido({ nome: "  " })],
    ["sem gestor", () => { const c: any = corpoValido(); delete c.gestor; return c; }],
    ["e-mail do gestor inválido", () => corpoValido({}, { email: "isso-nao-e-email" })],
    ["nome do gestor vazio", () => corpoValido({}, { nome: "" })],
    ["telefone do gestor inválido", () => corpoValido({}, { telefone: "123" })],
    ["sem CNPJ e sem marcar 'sem CNPJ'", () => corpoValido({ cnpj: undefined })],
    ["CNPJ com dígito errado", () => corpoValido({ cnpj: "11.222.333/0001-82" })],
    ["CNPJ curto", () => corpoValido({ cnpj: "1234567" })],
    ["CNPJ de dígitos repetidos", () => corpoValido({ cnpj: "11111111111111" })],
    ["CNPJ com letras", () => corpoValido({ cnpj: "ABCDEFGHIJKLMN" })],
    ["'sem CNPJ' sem explicar nas observações", () => corpoValido({ cnpj: undefined, sem_cnpj: true, observacoes: "" })],
    ["'sem CNPJ' mas informou CNPJ", () => corpoValido({ sem_cnpj: true })],
    ["telefone inválido", () => corpoValido({ telefone: "123" })],
    ["UF inexistente", () => corpoValido({ uf: "XX" })],
    ["plano inexistente", () => corpoValido({ plano: "GRATIS" })],
    ["data de início impossível", () => corpoValido({ inicio_contrato: "2026-02-30" })],
    ["data de início em outro formato", () => corpoValido({ inicio_contrato: "01/03/2026" })],
    ["e-mail de cobrança inválido", () => corpoValido({ email_cobranca: "cobranca" })],
    ["observações enormes", () => corpoValido({ observacoes: "x".repeat(1001) })],
    ["nome enorme", () => corpoValido({ nome: "x".repeat(121) })],
  ])("recusa: %s (400) e nada é criado", async (_n, montar) => {
    const corpo: any = montar();
    const antes = (await pool.query(`SELECT COUNT(*)::int n FROM empresas`)).rows[0].n;
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(corpo);
    expect(res.status).toBe(400);
    expect((await pool.query(`SELECT COUNT(*)::int n FROM empresas`)).rows[0].n).toBe(antes);
  });

  it("cliente sem CNPJ (MEI/pessoa física) é aceito quando a observação explica", async () => {
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(
      corpoValido({ cnpj: undefined, sem_cnpj: true, observacoes: "MEI, emite nota como pessoa física" })
    );
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT cnpj, sem_cnpj FROM empresas WHERE id = $1`, [res.body.empresa.id]);
    expect(rows[0]).toEqual({ cnpj: null, sem_cnpj: true });
  });

  it("CNPJ repetido é recusado, mesmo escrito com máscara diferente", async () => {
    const cnpj = cnpjAleatorio();
    expect((await criarEmpresa({ cnpj: mascara(cnpj) })).res.status).toBe(201);

    const semMascara = await criarEmpresa({ cnpj });
    expect(semMascara.res.status).toBe(400);
    expect(JSON.stringify(semMascara.res.body)).toMatch(/CNPJ/);
  });

  it("duas criações AO MESMO TEMPO com o mesmo CNPJ: só uma passa (o banco garante)", async () => {
    const cnpj = cnpjAleatorio();
    const [a, b] = await Promise.all([criarEmpresa({ cnpj }), criarEmpresa({ cnpj })]);
    expect([a.res.status, b.res.status].sort()).toEqual([201, 400]);
    expect((await pool.query(`SELECT COUNT(*)::int n FROM empresas WHERE cnpj = $1`, [cnpj])).rows[0].n).toBe(1);
  });

  it("nome repetido (mesmo com maiúsculas diferentes) é recusado", async () => {
    const { corpo } = await criarEmpresa();
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(corpoValido({ nome: String(corpo.nome).toUpperCase() }));
    expect(res.status).toBe(400);
  });

  it("e-mail de gestor já usado em qualquer empresa é recusado e não deixa empresa pela metade", async () => {
    const nome = `${PREFIXO}sem_email_${sufixo()}`;
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(
      corpoValido({ nome }, { email: `${fx.A.marcador.toLowerCase()}_gestor@vitest.local`.toUpperCase() })
    );
    expect(res.status).toBe(400);
    expect((await pool.query(`SELECT COUNT(*)::int n FROM empresas WHERE nome = $1`, [nome])).rows[0].n).toBe(0);
  });

  it("papel/empresa/senha enviados no corpo são ignorados: o gestor nasce sempre GESTOR, na empresa nova", async () => {
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(
      corpoValido({ criada_por: 1, ativo: false }, { role: "ADMIN", empresa_id: fx.A.empresaId, senha: "abc" })
    );
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT role, empresa_id FROM usuarios WHERE email = $1`, [(res.body.gestor as any).email]);
    expect(rows[0].role).toBe("GESTOR");
    expect(rows[0].empresa_id).toBe(res.body.empresa.id);
    expect(rows[0].empresa_id).not.toBe(fx.A.empresaId);
    const e = (await pool.query(`SELECT ativo, criada_por FROM empresas WHERE id = $1`, [res.body.empresa.id])).rows[0];
    expect(e).toEqual({ ativo: true, criada_por: fx.A.adminId });
  });

  it("texto malicioso vira dado, nunca comando (SQL/HTML)", async () => {
    const nome = `${PREFIXO}x'); DROP TABLE empresas;-- <script>${sufixo()}`;
    const res = await comoAdmin(request(app).post("/admin/empresas")).send(corpoValido({ nome }));
    expect(res.status).toBe(201);
    expect((await pool.query(`SELECT nome FROM empresas WHERE id = $1`, [res.body.empresa.id])).rows[0].nome).toBe(nome);
    expect((await pool.query(`SELECT to_regclass('empresas') r`)).rows[0].r).not.toBeNull();
  });
});

describe("editar os dados de uma empresa", () => {
  let empresaId: string;
  let outraCnpj: string;

  beforeAll(async () => {
    empresaId = (await criarEmpresa()).res.body.empresa.id;
    outraCnpj = String((await criarEmpresa()).corpo.cnpj).replace(/\D/g, "");
  });

  it("atualiza identificação, contato e plano; o resto da empresa não muda", async () => {
    const novo = { nome: `${PREFIXO}renomeada_${sufixo()}`, cnpj: mascara(cnpjAleatorio()), telefone: "1133334444", plano: "PROFISSIONAL", cidade: "Campinas", uf: "SP", observacoes: "Subiu de plano" };
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}`)).send(novo);

    expect(res.status).toBe(200);
    expect(res.body.empresa.nome).toBe(novo.nome);
    expect(res.body.empresa.plano).toBe("PROFISSIONAL");
    expect(res.body.empresa.telefone).toBe("1133334444");
    expect(res.body.empresa.ativo).toBe(true);
    expect(res.body.gestores).toHaveLength(1);
  });

  it("regrava a mesma empresa com o próprio CNPJ e o próprio nome (não conflita consigo mesma)", async () => {
    const atual = (await comoAdmin(request(app).get(`/admin/empresas/${empresaId}`))).body.empresa;
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}`)).send({ nome: atual.nome, cnpj: atual.cnpj, plano: "BASICO" });
    expect(res.status).toBe(200);
  });

  it("não deixa trocar para o CNPJ ou o nome de OUTRA empresa", async () => {
    const cnpj = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}`)).send({ nome: `${PREFIXO}outro_${sufixo()}`, cnpj: outraCnpj });
    expect(cnpj.status).toBe(400);

    const nomeDaOutra = (await pool.query(`SELECT nome FROM empresas WHERE cnpj = $1`, [outraCnpj])).rows[0].nome;
    const nome = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}`)).send({ nome: nomeDaOutra, cnpj: mascara(cnpjAleatorio()) });
    expect(nome.status).toBe(400);
  });

  it.each([
    ["CNPJ inválido", { cnpj: "11.222.333/0001-82" }],
    ["sem CNPJ e sem explicar", { cnpj: undefined }],
    ["plano inexistente", { plano: "OURO" }],
    ["UF inexistente", { uf: "ZZ" }],
  ])("recusa: %s (400) e nada muda", async (_n, mudanca) => {
    const antes = (await comoAdmin(request(app).get(`/admin/empresas/${empresaId}`))).body.empresa;
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}`)).send({ nome: antes.nome, cnpj: antes.cnpj, ...mudanca });
    expect(res.status).toBe(400);
    const depois = (await comoAdmin(request(app).get(`/admin/empresas/${empresaId}`))).body.empresa;
    expect(depois.cnpj).toBe(antes.cnpj);
    expect(depois.plano).toBe(antes.plano);
  });

  it("empresa inexistente: 404; gestor: 403", async () => {
    const corpo = { nome: `${PREFIXO}inexistente`, cnpj: cnpjAleatorio() };
    expect((await comoAdmin(request(app).patch(`/admin/empresas/00000000-0000-0000-0000-000000000000`)).send(corpo)).status).toBe(404);
    expect((await com(fx.A.tokenGestor)(request(app).patch(`/admin/empresas/${empresaId}`)).send(corpo)).status).toBe(403);
  });

  it("a edição fica na auditoria", async () => {
    const { rows } = await pool.query(`SELECT acao, admin_id FROM auditoria_admin WHERE empresa_id = $1 AND acao = 'editar_empresa'`, [empresaId]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].admin_id).toBe(fx.A.adminId);
  });

  it("empresa antiga, cadastrada antes destes campos (sem CNPJ), continua aparecendo e pode ser completada", async () => {
    const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${PREFIXO}antiga_${sufixo()}`]);
    const id = rows[0].id;

    const detalhe = await comoAdmin(request(app).get(`/admin/empresas/${id}`));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.empresa.cnpj).toBeNull();
    expect(detalhe.body.empresa.plano).toBeNull();
    expect(detalhe.body.gestores).toEqual([]);

    const completa = await comoAdmin(request(app).patch(`/admin/empresas/${id}`)).send({ nome: detalhe.body.empresa.nome, cnpj: cnpjAleatorio(), plano: "BASICO" });
    expect(completa.status).toBe(200);
  });
});

describe("primeiro acesso: senha temporária", () => {
  let empresaId: string;
  let email: string;
  let temporaria: string;
  let token: string;

  beforeAll(async () => {
    const criada = await criarEmpresa();
    empresaId = criada.res.body.empresa.id;
    email = criada.corpo.gestor.email;
    temporaria = criada.res.body.senha_temporaria;
  });

  it("o login funciona e avisa que precisa trocar a senha", async () => {
    const res = await entrar(email, temporaria);
    expect(res.status).toBe(200);
    expect(res.body.user.deve_trocar_senha).toBe(true);
    expect(res.body.user.empresa_id).toBe(empresaId);
    token = res.body.token;
  });

  it("enquanto não trocar, o sistema fica bloqueado (menos a troca de senha e a leitura do perfil)", async () => {
    const bloqueada = await com(token)(request(app).get("/maquinas"));
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body.codigo).toBe("TROCAR_SENHA");
    expect((await com(token)(request(app).get("/ordens-servico"))).status).toBe(403);
    expect((await com(token)(request(app).get("/usuarios"))).status).toBe(403);
    expect((await com(token)(request(app).get("/permissoes/eu"))).status).toBe(200);
  });

  it.each([
    ["senha atual errada", { senha_atual: "errada123", nova_senha: "NovaSenha123" }],
    ["curta demais", { senha_atual: "@@temp@@", nova_senha: "Ab1" }],
    ["sem número", { senha_atual: "@@temp@@", nova_senha: "SomenteLetras" }],
    ["sem letra", { senha_atual: "@@temp@@", nova_senha: "1234567890" }],
    ["igual à atual", { senha_atual: "@@temp@@", nova_senha: "@@temp@@" }],
    ["sem corpo", {}],
  ])("troca recusada: %s", async (_n, corpo) => {
    const enviar = JSON.parse(JSON.stringify(corpo).replaceAll("@@temp@@", temporaria));
    const res = await com(token)(request(app).patch("/conta/senha")).send(enviar);
    expect(res.status).toBe(400);
    expect((await com(token)(request(app).get("/maquinas"))).status).toBe(403);
  });

  it("sem token não troca senha de ninguém", async () => {
    const res = await request(app).patch("/conta/senha").send({ senha_atual: temporaria, nova_senha: "NovaSenha123" });
    expect(res.status).toBe(401);
  });

  it("trocando a senha, libera o sistema na hora e a senha antiga deixa de valer", async () => {
    const troca = await com(token)(request(app).patch("/conta/senha")).send({ senha_atual: temporaria, nova_senha: "NovaSenha123" });
    expect(troca.status).toBe(200);
    expect(typeof troca.body.token).toBe("string");

    // o token antigo (senha temporária) deixa de valer; o novo libera o sistema na hora
    const antigo = await com(token)(request(app).get("/maquinas"));
    expect(antigo.status).toBe(401);
    expect(antigo.body.codigo).toBe("SESSAO_ENCERRADA");

    const liberada = await com(troca.body.token)(request(app).get("/maquinas"));
    expect(liberada.status).toBe(200);
    expect(liberada.body).toEqual([]);

    expect((await entrar(email, temporaria)).status).toBe(400);
    const novo = await entrar(email, "NovaSenha123");
    expect(novo.status).toBe(200);
    expect(novo.body.user.deve_trocar_senha).toBe(false);
  });

  it("o gestor da empresa nova enxerga só a empresa dele e não alcança o painel", async () => {
    const novo = await entrar(email, "NovaSenha123");
    const t = novo.body.token;

    const usuarios = await com(t)(request(app).get("/usuarios"));
    expect(usuarios.status).toBe(200);
    expect(usuarios.body).toHaveLength(1);
    expect(usuarios.body[0].email).toBe(email);
    expect(JSON.stringify(usuarios.body)).not.toContain(fx.A.marcador);

    expect((await com(t)(request(app).get("/admin/empresas"))).status).toBe(403);
    expect((await com(t)(request(app).get(`/admin/empresas/${fx.A.empresaId}`))).status).toBe(403);
    expect((await com(t)(request(app).post("/admin/empresas")).send(corpoValido())).status).toBe(403);
    expect((await com(t)(request(app).get(`/maquinas/${fx.A.maquinaId}`))).status).toBeGreaterThanOrEqual(400);
  });

  it("um usuário comum troca a própria senha sem nenhuma permissão especial", async () => {
    // usuário próprio: trocar a senha encerra as sessões antigas e o técnico da fixture é usado por outros testes
    const tec = await criarUsuarioTeste(fx.A, { role: "TECNICO" });
    await pool.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [await bcrypt.hash("Teste@123", 4), tec.id]);
    const res = await com(tec.token)(request(app).patch("/conta/senha")).send({ senha_atual: "Teste@123", nova_senha: "Teste@1234" });
    expect(res.status).toBe(200);
    await com(res.body.token)(request(app).patch("/conta/senha")).send({ senha_atual: "Teste@1234", nova_senha: "Teste@123" });
  });
});

describe("inativar e reativar empresa", () => {
  let empresaId: string;
  let email: string;
  let token: string;

  beforeAll(async () => {
    const criada = await criarEmpresa();
    empresaId = criada.res.body.empresa.id;
    email = criada.corpo.gestor.email;

    const primeiro = await entrar(email, criada.res.body.senha_temporaria);
    await com(primeiro.body.token)(request(app).patch("/conta/senha")).send({
      senha_atual: criada.res.body.senha_temporaria,
      nova_senha: "SenhaDoGestor1",
    });
    token = (await entrar(email, "SenhaDoGestor1")).body.token;

    const setor = await pool.query(`INSERT INTO setores (nome, descricao, empresa_id) VALUES ($1,'x',$2) RETURNING id`, [`${PREFIXO}setor_inativa`, empresaId]);
    await pool.query(
      `INSERT INTO maquinas (nome, modelo, fabricante, ano, setor_id, status, empresa_id, proxima_manutencao)
       VALUES ($1,'M','F',2024,$2,'ativa',$3, CURRENT_DATE)`,
      [`${PREFIXO}maquina_inativa`, setor.rows[0].id, empresaId]
    );
  });

  it("antes de inativar, o gestor acessa normalmente", async () => {
    expect((await com(token)(request(app).get("/maquinas"))).status).toBe(200);
  });

  it("a empresa entra nas varreduras automáticas (preventiva) enquanto está ativa", async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const lista = await new MaquinaRepository().buscarPorDataProximaManutencao(hoje);
    expect(lista.some((m: any) => m.empresa_id === empresaId)).toBe(true);
  });

  it("não deixa o administrador inativar a própria empresa", async () => {
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${fx.A.empresaId}/situacao`)).send({ ativo: false });
    expect(res.status).toBe(400);
    expect((await pool.query(`SELECT ativo FROM empresas WHERE id = $1`, [fx.A.empresaId])).rows[0].ativo).toBe(true);
  });

  it("inativar: vale NA HORA, mesmo com o token ainda válido e o perfil em cache", async () => {
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}/situacao`)).send({ ativo: false, motivo: "Pagamento em atraso" });
    expect(res.status).toBe(200);
    expect(res.body.empresa.ativo).toBe(false);
    expect(res.body.empresa.motivo_inativacao).toBe("Pagamento em atraso");
    expect(res.body.empresa.inativada_em).not.toBeNull();

    const barrado = await com(token)(request(app).get("/maquinas"));
    expect(barrado.status).toBe(401);
    expect(barrado.body.codigo).toBe("EMPRESA_INATIVA");
    expect((await com(token)(request(app).get("/permissoes/eu"))).status).toBe(401);
  });

  it("empresa inativa não consegue entrar de novo", async () => {
    const res = await entrar(email, "SenhaDoGestor1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inativa/i);
  });

  it("os dados continuam guardados (a empresa e o gestor seguem no cadastro)", async () => {
    const res = await comoAdmin(request(app).get(`/admin/empresas/${empresaId}`));
    expect(res.body.empresa.ativo).toBe(false);
    expect(res.body.gestores).toHaveLength(1);
    expect((await pool.query(`SELECT COUNT(*)::int n FROM maquinas WHERE empresa_id = $1`, [empresaId])).rows[0].n).toBe(1);
  });

  it("empresa inativa sai das varreduras automáticas", async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const lista = await new MaquinaRepository().buscarPorDataProximaManutencao(hoje);
    expect(lista.some((m: any) => m.empresa_id === empresaId)).toBe(false);
  });

  it("inativar uma empresa não afeta as outras", async () => {
    expect((await com(fx.A.tokenTecnico)(request(app).get("/maquinas"))).status).toBe(200);
    expect((await com(fx.B.tokenGestor)(request(app).get("/maquinas"))).status).toBe(200);
  });

  it("inativar de novo é inofensivo (não muda nada)", async () => {
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}/situacao`)).send({ ativo: false, motivo: "outro motivo" });
    expect(res.status).toBe(200);
    expect(res.body.empresa.motivo_inativacao).toBe("Pagamento em atraso");
  });

  it("gestor não inativa nem reativa empresa nenhuma", async () => {
    const res = await com(fx.A.tokenGestor)(request(app).patch(`/admin/empresas/${empresaId}/situacao`)).send({ ativo: true });
    expect(res.status).toBe(403);
    expect((await pool.query(`SELECT ativo FROM empresas WHERE id = $1`, [empresaId])).rows[0].ativo).toBe(false);
  });

  it("valor inválido em 'ativo' é recusado", async () => {
    for (const corpo of [{}, { ativo: "sim" }, { ativo: 1 }]) {
      expect((await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}/situacao`)).send(corpo)).status).toBe(400);
    }
  });

  it("reativar devolve o acesso, com os dados intactos", async () => {
    const res = await comoAdmin(request(app).patch(`/admin/empresas/${empresaId}/situacao`)).send({ ativo: true });
    expect(res.status).toBe(200);
    expect(res.body.empresa.ativo).toBe(true);
    expect(res.body.empresa.inativada_em).toBeNull();
    expect(res.body.empresa.motivo_inativacao).toBeNull();

    expect((await com(token)(request(app).get("/maquinas"))).status).toBe(200);
    const login = await entrar(email, "SenhaDoGestor1");
    expect(login.status).toBe(200);
    expect((await com(login.body.token)(request(app).get("/maquinas"))).body).toHaveLength(1);
  });

  it("inativar e reativar ficam na auditoria, em ordem", async () => {
    const { rows } = await pool.query(`SELECT acao, admin_id FROM auditoria_admin WHERE empresa_id = $1 ORDER BY id`, [empresaId]);
    expect(rows.map((r) => r.acao)).toEqual(["criar_empresa", "inativar_empresa", "reativar_empresa"]);
    expect(rows.every((r) => r.admin_id === fx.A.adminId)).toBe(true);
  });
});

describe("proteção contra cadastro em massa", () => {
  it("a criação de empresa avisa o limite (o limitador está ligado na rota)", async () => {
    const { res } = await criarEmpresa();
    expect(res.headers["ratelimit-limit"] ?? res.headers["ratelimit"]).toBeDefined();
  });

  it("passou do limite: 429, mesmo com o token certo — e cada administrador tem o seu contador", async () => {
    const mini = express();
    mini.use(express.json());
    mini.use((req, _res, next) => {
      (req as any).user = { id: Number(req.headers["x-admin"] ?? 1) };
      next();
    });
    mini.post("/criar", limitadorDeCriacaoAdmin(3, 60_000), (_req, res) => res.status(201).json({ ok: true }));

    const criar = (admin: number) => request(mini).post("/criar").set("x-admin", String(admin));

    expect((await criar(1)).status).toBe(201);
    expect((await criar(1)).status).toBe(201);
    expect((await criar(1)).status).toBe(201);
    const barrado = await criar(1);
    expect(barrado.status).toBe(429);
    expect(barrado.body.message).toBeDefined();

    // outro administrador não é afetado
    expect((await criar(2)).status).toBe(201);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("login", () => {
  it("corpo vazio devolve 400 (não 500)", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("e-mail em formato de objeto devolve 400", async () => {
    const res = await request(app).post("/auth/login").send({ email: { $ne: null }, senha: "x" });
    expect(res.status).toBe(400);
  });

  it("senha numérica devolve 400", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@b.com", senha: 12345 });
    expect(res.status).toBe(400);
  });
});

describe("usuários", () => {
  const validos = (extra = {}) => ({
    nome: "Fulano Teste",
    email: `${Date.now()}_${Math.random().toString(36).slice(2)}@vitest.local`,
    senha: "abc123",
    role: "OPERADOR",
    ...extra,
  });

  it.each([
    ["sem nome", { nome: "" }],
    ["e-mail inválido", { email: "nao-e-email" }],
    ["senha curta", { senha: "123" }],
    ["papel inexistente", { role: "SUPERUSUARIO" }],
  ])("criar %s devolve 400", async (_nome, extra) => {
    const res = await comoA(request(app).post("/usuarios")).send(validos(extra));
    expect(res.status).toBe(400);
    expect(res.body.erros).toBeDefined();
  });

  it("criar válido devolve 201 e ignora empresa_id forjado no corpo", async () => {
    const dados = validos({ empresa_id: fx.B.empresaId });
    const res = await comoA(request(app).post("/usuarios")).send(dados);
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT empresa_id FROM usuarios WHERE email = $1`, [dados.email]);
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);
  });

  it("editar sem enviar 'ativo' não desativa o usuário", async () => {
    const res = await comoA(request(app).put(`/usuarios/${fx.A.tecnicoId}`)).send({
      nome: `${fx.A.marcador}_tecnico`,
      email: `${fx.A.marcador.toLowerCase()}_tecnico@vitest.local`,
      role: "TECNICO",
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(`SELECT ativo FROM usuarios WHERE id = $1`, [fx.A.tecnicoId]);
    expect(rows[0].ativo).toBe(true);
  });
});

describe("setores e parceiros", () => {
  it("setor sem nome devolve 400", async () => {
    const res = await comoA(request(app).post("/setores")).send({ nome: "  ", descricao: "x" });
    expect(res.status).toBe(400);
  });

  it("setor com nome gigante devolve 400", async () => {
    const res = await comoA(request(app).post("/setores")).send({ nome: "a".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("setor com descrição vazia é aceito (como o front envia)", async () => {
    const res = await comoA(request(app).post("/setores")).send({ nome: `${fx.A.marcador}_s2`, descricao: "" });
    expect(res.status).toBe(201);
  });

  it("parceiro sem nome devolve 400", async () => {
    const res = await comoA(request(app).post("/parceiros")).send({ cnpj: "123" });
    expect(res.status).toBe(400);
  });

  it("parceiro só com nome (sem CNPJ) é aceito E realmente gravado", async () => {
    const nome = `${fx.A.marcador}_p2`;
    const res = await comoA(request(app).post("/parceiros")).send({ nome });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    const { rows } = await pool.query(`SELECT empresa_id FROM parceiros WHERE nome = $1`, [nome]);
    expect(rows.length).toBe(1);
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);
  });

  it("dois parceiros sem CNPJ na mesma empresa convivem (CNPJ vazio não conflita)", async () => {
    for (const n of ["a", "b"]) {
      const res = await comoA(request(app).post("/parceiros")).send({ nome: `${fx.A.marcador}_sem_cnpj_${n}`, cnpj: "" });
      expect(res.status).toBe(201);
    }
  });

  it("CNPJ repetido na mesma empresa é recusado", async () => {
    const cnpj = "55555555555555";
    const um = await comoA(request(app).post("/parceiros")).send({ nome: `${fx.A.marcador}_c1`, cnpj });
    expect(um.status).toBe(201);
    const dois = await comoA(request(app).post("/parceiros")).send({ nome: `${fx.A.marcador}_c2`, cnpj });
    expect(dois.status).toBe(400);
  });
});

describe("máquinas (multipart)", () => {
  it.each([
    ["sem nome", { nome: "", modelo: "M", setor_id: "1" }],
    ["setor_id não numérico", { nome: "N", modelo: "M", setor_id: "abc" }],
    ["ano não numérico", { nome: "N", modelo: "M", setor_id: "1", ano: "abc" }],
    ["data fora do formato", { nome: "N", modelo: "M", setor_id: "1", ultima_manutencao: "ontem" }],
  ])("criar %s devolve 400", async (_nome, campos) => {
    let r = comoA(request(app).post("/maquinas"));
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v as string);
    expect((await r).status).toBe(400);
  });

  it("criar como o front envia (campos vazios / 'null') devolve 201", async () => {
    const res = await comoA(request(app).post("/maquinas"))
      .field("nome", `${fx.A.marcador}_maq_valida`)
      .field("modelo", "M1")
      .field("fabricante", "")
      .field("ano", "2024")
      .field("status", "ativa")
      .field("setor_id", String(fx.A.setorId))
      .field("intervalo_manutencao_dias", "90")
      .field("ultima_manutencao", "2026-01-15");
    expect(res.status).toBe(201);
  });
});

describe("ordens de serviço", () => {
  const url = () => `/ordens-servico/${fx.A.osId}`;

  it.each([
    ["descrição vazia", { descricao: "" }],
    ["prioridade inválida", { prioridade: "URGENTISSIMA" }],
    ["tipo inválido", { tipo_manutencao: "MAGICA" }],
    ["máquina não numérica", { maquina_id: "abc" }],
  ])("criar com %s devolve 400", async (_nome, extra) => {
    const res = await comoA(request(app).post("/ordens-servico")).send({
      maquina_id: fx.A.maquinaId,
      descricao: "ok",
      tipo_manutencao: "CORRETIVA",
      prioridade: "ALTA",
      ...extra,
    });
    expect(res.status).toBe(400);
  });

  it("finalizar sem resolução devolve 400", async () => {
    const res = await comoA(request(app).patch(`${url()}/finalizar`)).send({ resolucao: "" });
    expect(res.status).toBe(400);
  });

  it("finalizar com valor negativo devolve 400", async () => {
    const res = await comoA(request(app).patch(`${url()}/finalizar`)).send({ resolucao: "ok", valor_gasto: -5 });
    expect(res.status).toBe(400);
  });

  it("cancelar sem motivo devolve 400", async () => {
    const res = await comoA(request(app).patch(`${url()}/cancelar`)).send({});
    expect(res.status).toBe(400);
  });


  it("atribuir grava quem atribuiu a partir do token, ignorando o corpo", async () => {
    const res = await comoA(request(app).patch(`${url()}/atribuir`)).send({
      id_tecnico: fx.A.tecnicoId,
      id_atribuido_por: fx.B.adminId,
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(`SELECT id_atribuido_por, id_tecnico FROM ordens_servico WHERE id = $1`, [
      fx.A.osId,
    ]);
    expect(rows[0].id_tecnico).toBe(fx.A.tecnicoId);
    expect(rows[0].id_atribuido_por).toBe(fx.A.adminId);
  });
});

describe("ids na URL", () => {
  it.each(["abc", "-1", "0", "1.5", "99999999999", "1;DROP"])("/maquinas/%s devolve 400", async (id) => {
    const res = await comoA(request(app).get(`/maquinas/${id}`));
    expect(res.status).toBe(400);
  });

  it("/ordens-servico/abc/iniciar devolve 400", async () => {
    const res = await comoA(request(app).patch("/ordens-servico/abc/iniciar"));
    expect(res.status).toBe(400);
  });

  it("/telemetria/abc devolve 400", async () => {
    const res = await comoA(request(app).get("/telemetria/abc"));
    expect(res.status).toBe(400);
  });
});

describe("monitoramento, notificações e push", () => {
  it("parâmetros com chave vazia devolvem 400", async () => {
    const res = await comoA(request(app).put(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros`)).send([
      { chave: "", atencao: 1, alarme: 2 },
    ]);
    expect(res.status).toBe(400);
  });

  it("parâmetros com limite não numérico devolvem 400", async () => {
    const res = await comoA(request(app).put(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros`)).send([
      { chave: "temperatura", atencao: "muito", alarme: 2 },
    ]);
    expect(res.status).toBe(400);
  });

  it("parâmetros válidos (formato do front) são salvos", async () => {
    const res = await comoA(request(app).put(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros`)).send([
      {
        id: 999,
        maquina_id: fx.A.maquinaId,
        chave: "temperatura",
        unidade: "°C",
        minimo: null,
        atencao: 70,
        alarme: 90,
        janela_seg: 120,
        abrir_os_auto: false,
        ativo: true,
      },
    ]);
    expect(res.status).toBe(200);
    expect(Number(res.body[0].atencao)).toBe(70);
  });

  it("notificação para usuário de OUTRA empresa é recusada", async () => {
    const titulo = `${fx.B.marcador}_spam`;
    const res = await comoB(request(app).post("/notificacoes")).send({
      usuario_id: fx.A.adminId,
      titulo,
      mensagem: "olá",
      tipo: "INFO",
    });
    expect(res.status).toBe(400);
    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM notificacoes WHERE titulo = $1`, [titulo]);
    expect(rows[0].n).toBe(0);
  });

  it("notificação para usuário da própria empresa é criada", async () => {
    const res = await comoA(request(app).post("/notificacoes")).send({
      usuario_id: fx.A.tecnicoId,
      titulo: `${fx.A.marcador}_aviso`,
      mensagem: "olá",
      tipo: "INFO",
    });
    expect(res.status).toBe(201);
  });

  it("push subscription pertence a quem está logado, mesmo com usuario_id forjado", async () => {
    const endpoint = `https://push.fake/${fx.B.marcador}`;
    const res = await comoB(request(app).post("/push-subscriptions")).send({
      usuario_id: fx.A.adminId,
      endpoint,
      p256dh: "chave",
      auth: "auth",
    });
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT usuario_id, empresa_id FROM push_subscriptions WHERE endpoint = $1`, [
      endpoint,
    ]);
    expect(rows[0].usuario_id).toBe(fx.B.adminId);
    expect(rows[0].empresa_id).toBe(fx.B.empresaId);
  });

  it("upload de anexo sem 'origem' devolve 400", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("maquina_id", String(fx.A.maquinaId))
      .attach("arquivo", Buffer.from("89504e470d0a1a0a", "hex"), { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });
});

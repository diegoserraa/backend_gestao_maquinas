import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { RetencaoTelemetriaService, lerRetencaoDias } from "../src/services/RetencaoTelemetriaService";
import { criarFixture, fecharPool, limparTudo, pool, Fixture, PREFIXO } from "./helpers/fixture";

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);
const total = (res: request.Response) => Number(res.headers["x-total-count"]);

beforeAll(async () => {
  fx = await criarFixture();

  // A: 1 O.S. do fixture + 5 = 6 | 1 máquina do fixture + 2 = 3 | 1 notificação do fixture + 5 = 6
  for (let i = 0; i < 5; i++) {
    await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, empresa_id)
       VALUES ($1,$2,'ABERTA','CORRETIVA','BAIXA', NOW(), $3)`,
      [fx.A.maquinaId, `${fx.A.marcador}_os_extra_${i}`, fx.A.empresaId]
    );
    await pool.query(
      `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, lida, empresa_id)
       VALUES ($1,$2,'m','INFO',$3,$4)`,
      [fx.A.adminId, `${fx.A.marcador}_notif_${i}`, i < 2, fx.A.empresaId] // 2 lidas, 3 não lidas (+1 do fixture = 4)
    );
  }
  for (let i = 0; i < 2; i++) {
    await pool.query(
      `INSERT INTO maquinas (nome, modelo, setor_id, status, empresa_id) VALUES ($1,'M',$2,'ativa',$3)`,
      [`${fx.A.marcador}_maq_extra_${i}`, fx.A.setorId, fx.A.empresaId]
    );
  }
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("paginação das listagens", () => {
  it("O.S.: sem parâmetros devolve tudo (dentro do limite) como array + total no cabeçalho", async () => {
    const res = await comoA(request(app).get("/ordens-servico"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(6);
    expect(total(res)).toBe(6);
  });

  it("O.S.: limite e página fatiam certo, do mais novo pro mais antigo, sem repetir", async () => {
    const p1 = await comoA(request(app).get("/ordens-servico?limite=4&pagina=1"));
    const p2 = await comoA(request(app).get("/ordens-servico?limite=4&pagina=2"));
    expect(p1.body.length).toBe(4);
    expect(p2.body.length).toBe(2);
    expect(total(p1)).toBe(6);
    expect(total(p2)).toBe(6);

    const ids = [...p1.body, ...p2.body].map((o: any) => o.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("página além do fim devolve lista vazia e o total continua certo", async () => {
    const res = await comoA(request(app).get("/ordens-servico?limite=4&pagina=99"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(total(res)).toBe(6);
  });

  it("limite gigante não estoura: é reduzido ao máximo", async () => {
    const res = await comoA(request(app).get("/ordens-servico?limite=999999"));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(1000);
  });

  it.each(["limite=abc", "limite=0", "limite=-5", "pagina=0", "pagina=x", "limite=1.5"])(
    "parâmetro inválido (%s) devolve 400",
    async (q) => {
      const res = await comoA(request(app).get(`/ordens-servico?${q}`));
      expect(res.status).toBe(400);
    }
  );

  it("o total de uma empresa não inclui as O.S. da outra", async () => {
    const res = await comoB(request(app).get("/ordens-servico"));
    expect(total(res)).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });

  it("máquinas: paginação, total e isolamento", async () => {
    const p = await comoA(request(app).get("/maquinas?limite=2&pagina=2"));
    expect(p.body.length).toBe(1);
    expect(total(p)).toBe(3);
    expect(p.body[0].setor).not.toBeUndefined(); // formato com setor aninhado preservado

    const b = await comoB(request(app).get("/maquinas"));
    expect(total(b)).toBe(1);
  });

  it("notificações: só as do próprio usuário, paginadas, com total", async () => {
    const res = await comoA(request(app).get("/notificacoes?limite=2"));
    expect(res.body.length).toBe(2);
    expect(total(res)).toBe(6);

    const naoLidas = await comoA(request(app).get("/notificacoes/nao-lidas?limite=2&pagina=2"));
    expect(total(naoLidas)).toBe(4);
    expect(naoLidas.body.length).toBe(2);
    expect(naoLidas.body.every((n: any) => n.lida === false)).toBe(true);

    const outro = await comoA(request(app).get("/notificacoes")).set("Authorization", `Bearer ${fx.A.tokenTecnico}`);
    expect(total(outro)).toBe(0);
  });

  it("contador de não lidas continua igual (não depende da página)", async () => {
    const res = await comoA(request(app).get("/notificacoes/contador"));
    expect(res.body.total).toBe(4);
  });

  it("navegador consegue ler o X-Total-Count (CORS expõe o cabeçalho)", async () => {
    const res = await comoA(request(app).get("/ordens-servico").set("Origin", "http://localhost:5173"));
    expect(String(res.headers["access-control-expose-headers"])).toMatch(/X-Total-Count/i);
  });
});

describe("retenção da telemetria", () => {
  const servico = new RetencaoTelemetriaService();
  let empresaC: string;
  let maquinaC: number;

  async function leitura(maquinaId: number, empresaId: string, diasAtras: number) {
    await pool.query(
      `INSERT INTO telemetria_leituras (maquina_id, temperatura, recebido_em, empresa_id)
       VALUES ($1, 50, now() - make_interval(days => $2), $3)`,
      [maquinaId, diasAtras, empresaId]
    );
  }
  const contar = async (maquinaId: number) =>
    (await pool.query(`SELECT COUNT(*)::int n FROM telemetria_leituras WHERE maquina_id = $1`, [maquinaId])).rows[0].n;

  beforeAll(async () => {
    const emp = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${PREFIXO}C_empresa`]);
    empresaC = emp.rows[0].id;
    const setor = await pool.query(`INSERT INTO setores (nome, empresa_id) VALUES ($1,$2) RETURNING id`, [`${PREFIXO}C_setor`, empresaC]);
    const maq = await pool.query(
      `INSERT INTO maquinas (nome, modelo, setor_id, status, empresa_id) VALUES ($1,'M',$2,'ativa',$3) RETURNING id`,
      [`${PREFIXO}C_maquina`, setor.rows[0].id, empresaC]
    );
    maquinaC = maq.rows[0].id;

    // A: 12 antigas (100 dias) + 3 recentes | B: 2 antigas | C (fora do escopo): 2 antigas
    for (let i = 0; i < 12; i++) await leitura(fx.A.maquinaId, fx.A.empresaId, 100);
    for (const d of [1, 10, 89]) await leitura(fx.A.maquinaId, fx.A.empresaId, d);
    for (let i = 0; i < 2; i++) await leitura(fx.B.maquinaId, fx.B.empresaId, 200);
    for (let i = 0; i < 2; i++) await leitura(maquinaC, empresaC, 300);
  });

  it("apaga só o que passou do prazo, em lotes, e devolve quantas apagou", async () => {
    const apagadas = await servico.limparLeituras(90, { empresaIds: [fx.A.empresaId, fx.B.empresaId], lote: 5 });

    expect(apagadas).toBe(14); // 12 da A + 2 da B, em 3 lotes (5+5+4)
    expect(await contar(fx.A.maquinaId)).toBe(3); // as 3 recentes ficaram
    expect(await contar(fx.B.maquinaId)).toBe(0);
  });

  it("respeita o escopo: a empresa fora da lista não é tocada", async () => {
    expect(await contar(maquinaC)).toBe(2);
  });

  it("rodar de novo não apaga mais nada (idempotente)", async () => {
    expect(await servico.limparLeituras(90, { empresaIds: [fx.A.empresaId, fx.B.empresaId] })).toBe(0);
  });

  it("prazo menor apaga mais: 5 dias tira as de 10 e 89 dias, mantém a de 1 dia", async () => {
    await servico.limparLeituras(5, { empresaIds: [fx.A.empresaId] });
    expect(await contar(fx.A.maquinaId)).toBe(1);
  });

  it("não mexe na leitura atual da máquina (telemetria_atual)", async () => {
    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM telemetria_atual WHERE maquina_id = $1`, [fx.A.maquinaId]);
    expect(rows[0].n).toBe(1);
  });

  it("TELEMETRIA_RETENCAO_DIAS: padrão 90, valor inválido volta ao padrão, nunca abaixo de 7", () => {
    expect(lerRetencaoDias(undefined)).toBe(90);
    expect(lerRetencaoDias("")).toBe(90);
    expect(lerRetencaoDias("abc")).toBe(90);
    expect(lerRetencaoDias("30")).toBe(30);
    expect(lerRetencaoDias("0")).toBe(7);
    expect(lerRetencaoDias("-10")).toBe(7);
    expect(lerRetencaoDias("365")).toBe(365);
  });
});

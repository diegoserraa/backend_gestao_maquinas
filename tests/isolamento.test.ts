import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Regra testada aqui: um usuário da empresa B, com token válido da B,
 * NÃO pode ver, alterar nem apagar nada da empresa A — nem pelo id direto.
 */

let fx: Fixture;
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);

// nada do que pertence à empresa A pode aparecer numa resposta pra B
function semVazamento(res: request.Response) {
  expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  expect(JSON.stringify(res.body)).not.toContain(fx.A.empresaId);
}

async function contar(tabela: string, id: number) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${tabela} WHERE id = $1`, [id]);
  return rows[0].n as number;
}

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("listagens só mostram a própria empresa", () => {
  const listagens = [
    "/maquinas",
    "/setores",
    "/usuarios",
    "/usuarios/tecnicos",
    "/ordens-servico",
    "/parceiros",
    "/telemetria",
    "/monitoramento/alertas",
    "/monitoramento/pendentes",
  ];

  it.each(listagens)("B em %s não vê dados da A", async (rota) => {
    const res = await comoB(request(app).get(rota));
    expect(res.status).toBeLessThan(500);
    semVazamento(res);
  });

  it("controle: A vê os próprios dados (o teste não passa por estar tudo vazio)", async () => {
    const res = await comoA(request(app).get("/maquinas"));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(fx.A.marcador);
  });

  it("dashboard do gestor: B não vê números da A", async () => {
    const res = await comoB(request(app).get("/dashboard/gestor/kpis"));
    expect(res.status).toBe(200);
    semVazamento(res);
  });

  it("relatório de OS: B não vê OS da A", async () => {
    const res = await comoB(request(app).get("/relatorios/ordens-servico/preview"));
    semVazamento(res);
  });

  it("relatório de manutenção por máquina: B não vê máquina da A", async () => {
    const res = await comoB(request(app).get("/relatorios/manutencao/preview"));
    semVazamento(res);
  });
});

describe("acesso direto por id (IDOR)", () => {
  it("B não lê a máquina da A", async () => {
    const res = await comoB(request(app).get(`/maquinas/${fx.A.maquinaId}`));
    expect(res.status).not.toBe(200);
    semVazamento(res);
  });

  it("B não lê as OS da máquina da A", async () => {
    const res = await comoB(request(app).get(`/maquinas/${fx.A.maquinaId}/os`));
    semVazamento(res);
  });

  it("B não lê a OS da A", async () => {
    const res = await comoB(request(app).get(`/ordens-servico/${fx.A.osId}`));
    expect(res.status).not.toBe(200);
    semVazamento(res);
  });

  it("B não lê o setor da A", async () => {
    const res = await comoB(request(app).get(`/setores/${fx.A.setorId}`));
    semVazamento(res);
  });

  it("B não lê o parceiro da A", async () => {
    const res = await comoB(request(app).get(`/parceiros/${fx.A.parceiroId}`));
    semVazamento(res);
  });

  it("B não lê o usuário da A", async () => {
    const res = await comoB(request(app).get(`/usuarios/${fx.A.adminId}`));
    semVazamento(res);
  });

  it("B não lê a telemetria da máquina da A", async () => {
    const res = await comoB(request(app).get(`/telemetria/${fx.A.maquinaId}`));
    semVazamento(res);
    const hist = await comoB(request(app).get(`/telemetria/${fx.A.maquinaId}/historico`));
    semVazamento(hist);
  });

  it("B não lê os parâmetros de monitoramento da máquina da A", async () => {
    const res = await comoB(request(app).get(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros`));
    semVazamento(res);
  });

  it("B não lê os indicadores da máquina da A", async () => {
    const res = await comoB(request(app).get(`/ordens-servico/maquina/${fx.A.maquinaId}/indicadores`));
    semVazamento(res);
  });
});

describe("alterar/apagar recurso alheio não faz efeito", () => {
  it("B não consegue editar a máquina da A", async () => {
    await comoB(request(app).put(`/maquinas/${fx.A.maquinaId}`))
      .field("nome", "HACKEADA")
      .field("modelo", "x")
      .field("setor_id", String(fx.B.setorId));
    const { rows } = await pool.query(`SELECT nome FROM maquinas WHERE id = $1`, [fx.A.maquinaId]);
    expect(rows[0].nome).toBe(`${fx.A.marcador}_maquina`);
  });

  it("B não consegue mudar o status da máquina da A", async () => {
    await comoB(request(app).patch(`/maquinas/${fx.A.maquinaId}/status`)).send({});
    const { rows } = await pool.query(`SELECT status FROM maquinas WHERE id = $1`, [fx.A.maquinaId]);
    expect(rows[0].status).toBe("ativa");
  });

  it("B não consegue editar o setor da A", async () => {
    await comoB(request(app).put(`/setores/${fx.A.setorId}`)).send({ nome: "HACKEADO", descricao: "x" });
    const { rows } = await pool.query(`SELECT nome FROM setores WHERE id = $1`, [fx.A.setorId]);
    expect(rows[0].nome).toBe(`${fx.A.marcador}_setor`);
  });

  it("B não consegue editar o parceiro da A", async () => {
    await comoB(request(app).put(`/parceiros/${fx.A.parceiroId}`)).send({ nome: "HACKEADO", cnpj: "99999999999999" });
    const { rows } = await pool.query(`SELECT nome FROM parceiros WHERE id = $1`, [fx.A.parceiroId]);
    expect(rows[0].nome).toBe(`${fx.A.marcador}_parceiro`);
  });

  it("B não consegue editar o usuário da A", async () => {
    await comoB(request(app).put(`/usuarios/${fx.A.tecnicoId}`)).send({
      nome: "HACKEADO",
      email: "h@vitest.local",
      role: "ADMIN",
      ativo: true,
    });
    const { rows } = await pool.query(`SELECT nome, role FROM usuarios WHERE id = $1`, [fx.A.tecnicoId]);
    expect(rows[0].nome).toBe(`${fx.A.marcador}_tecnico`);
    expect(rows[0].role).toBe("TECNICO");
  });

  it("B não consegue desativar o usuário da A", async () => {
    await comoB(request(app).patch(`/usuarios/${fx.A.tecnicoId}/toggle-status`));
    const { rows } = await pool.query(`SELECT ativo FROM usuarios WHERE id = $1`, [fx.A.tecnicoId]);
    expect(rows[0].ativo).toBe(true);
  });

  const transicoes = ["atribuir", "iniciar", "pausar", "finalizar", "cancelar", "prioridade"];
  it.each(transicoes)("B não consegue '%s' a OS da A", async (acao) => {
    await comoB(request(app).patch(`/ordens-servico/${fx.A.osId}/${acao}`)).send({
      id_tecnico: fx.B.tecnicoId,
      prioridade: "BAIXA",
      resolucao: "x",
      motivo_cancelamento: "x",
    });
    const { rows } = await pool.query(
      `SELECT status, prioridade, id_tecnico FROM ordens_servico WHERE id = $1`,
      [fx.A.osId]
    );
    expect(rows[0].status).toBe("ABERTA");
    expect(rows[0].prioridade).toBe("ALTA");
    expect(rows[0].id_tecnico).toBeNull();
  });

  it("B não consegue editar a OS da A", async () => {
    await comoB(request(app).put(`/ordens-servico/${fx.A.osId}`)).send({ descricao: "HACKEADA" });
    const { rows } = await pool.query(`SELECT descricao FROM ordens_servico WHERE id = $1`, [fx.A.osId]);
    expect(rows[0].descricao).toBe(`${fx.A.marcador}_os`);
  });

  // exclusões por último: se algo vazar, o registro some e a checagem pega
  it("B não consegue apagar a OS da A", async () => {
    await comoB(request(app).delete(`/ordens-servico/${fx.A.osId}`));
    expect(await contar("ordens_servico", fx.A.osId)).toBe(1);
  });

  it("B não consegue apagar a máquina da A", async () => {
    await comoB(request(app).delete(`/maquinas/${fx.A.maquinaId}`));
    expect(await contar("maquinas", fx.A.maquinaId)).toBe(1);
  });

  it("B não consegue apagar o setor da A", async () => {
    await comoB(request(app).delete(`/setores/${fx.A.setorId}`));
    expect(await contar("setores", fx.A.setorId)).toBe(1);
  });

  it("B não consegue apagar o parceiro da A", async () => {
    await comoB(request(app).delete(`/parceiros/${fx.A.parceiroId}`));
    expect(await contar("parceiros", fx.A.parceiroId)).toBe(1);
  });

  it("B não consegue apagar o usuário da A", async () => {
    await comoB(request(app).delete(`/usuarios/${fx.A.tecnicoId}`));
    expect(await contar("usuarios", fx.A.tecnicoId)).toBe(1);
  });
});

describe("criar recurso apontando pra dado da outra empresa", () => {
  it("B não cria OS numa máquina da A", async () => {
    const res = await comoB(request(app).post("/ordens-servico")).send({
      maquina_id: fx.A.maquinaId,
      descricao: `${fx.B.marcador}_os_invasora`,
      tipo_manutencao: "CORRETIVA",
      prioridade: "ALTA",
    });
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ordens_servico WHERE maquina_id = $1 AND descricao = $2`,
      [fx.A.maquinaId, `${fx.B.marcador}_os_invasora`]
    );
    expect(rows[0].n).toBe(0);
    expect(res.status).not.toBe(201);
  });

  it("B não cria máquina dentro de um setor da A", async () => {
    const nome = `${fx.B.marcador}_maquina_invasora`;
    await comoB(request(app).post("/maquinas"))
      .field("nome", nome)
      .field("modelo", "x")
      .field("setor_id", String(fx.A.setorId));
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM maquinas WHERE nome = $1`, [nome]);
    expect(rows[0].n).toBe(0);
  });

  it("B não atribui uma OS sua a um técnico da A", async () => {
    const osB = await pool.query(`SELECT id FROM ordens_servico WHERE empresa_id = $1 LIMIT 1`, [fx.B.empresaId]);
    await comoB(request(app).patch(`/ordens-servico/${osB.rows[0].id}/atribuir`)).send({
      id_tecnico: fx.A.tecnicoId,
    });
    const { rows } = await pool.query(`SELECT id_tecnico FROM ordens_servico WHERE id = $1`, [osB.rows[0].id]);
    expect(rows[0].id_tecnico).toBeNull();
  });

  it("registro criado por B é gravado na empresa de B", async () => {
    const res = await comoB(request(app).post("/setores")).send({
      nome: `${fx.B.marcador}_setor_novo`,
      descricao: "x",
    });
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT empresa_id FROM setores WHERE id = $1`, [res.body.id]);
    expect(rows[0].empresa_id).toBe(fx.B.empresaId);
  });

  it("empresa_id enviado no corpo é ignorado (vale o do token)", async () => {
    const res = await comoB(request(app).post("/parceiros")).send({
      nome: `${fx.B.marcador}_parceiro_novo`,
      cnpj: "11111111111111",
      empresa_id: fx.A.empresaId,
    });
    expect(res.status).toBeLessThan(500);
    const { rows } = await pool.query(`SELECT empresa_id FROM parceiros WHERE nome = $1`, [
      `${fx.B.marcador}_parceiro_novo`,
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].empresa_id).toBe(fx.B.empresaId);
  });
});

describe("notificações e push (dados pessoais)", () => {
  it("B não lê notificações da A, mesmo passando usuario_id da A na query", async () => {
    const res = await comoB(request(app).get(`/notificacoes?usuario_id=${fx.A.adminId}`));
    semVazamento(res);
    const nl = await comoB(request(app).get(`/notificacoes/nao-lidas?usuario_id=${fx.A.adminId}`));
    semVazamento(nl);
  });

  it("B não marca como lida nem apaga notificação da A", async () => {
    await comoB(request(app).patch(`/notificacoes/${fx.A.notificacaoId}/lida`));
    await comoB(request(app).delete(`/notificacoes/${fx.A.notificacaoId}`));
    const { rows } = await pool.query(`SELECT lida, excluida FROM notificacoes WHERE id = $1`, [
      fx.A.notificacaoId,
    ]);
    expect(rows[0].lida).toBe(false);
    expect(rows[0].excluida).toBe(false);
  });

  it("B não lista push subscriptions de usuário da A", async () => {
    const res = await comoB(request(app).get(`/push-subscriptions/usuario/${fx.A.adminId}`));
    semVazamento(res);
  });

  it("dashboard de técnico: B não vê o resumo do técnico da A pelo id", async () => {
    const res = await comoB(request(app).get(`/dashboard/tecnico/${fx.A.tecnicoId}/resumo`));
    semVazamento(res);
  });
});

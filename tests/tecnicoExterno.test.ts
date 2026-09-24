import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Execução externa (parceiro): a O.S. é marcada (execucao_externa), sem
 * depender de um usuário "falso" com id fixo — funciona igual pra qualquer empresa.
 */

let fx: Fixture;
let osExterna: number; // vai ser atribuída a parceiro
let osNormal: number; // vai ser atribuída a técnico

const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);

async function novaOS(lado: Fixture["A"], descricao: string): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_solicitante, empresa_id)
     VALUES ($1,$2,'ABERTA','CORRETIVA','ALTA', NOW(), $3, $4) RETURNING id`,
    [lado.maquinaId, descricao, lado.adminId, lado.empresaId]
  );
  return rows[0].id;
}

async function ler(id: number) {
  const { rows } = await pool.query(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
  return rows[0];
}

beforeAll(async () => {
  fx = await criarFixture();
  osExterna = await novaOS(fx.A, `${fx.A.marcador}_os_externa`);
  osNormal = await novaOS(fx.A, `${fx.A.marcador}_os_normal`);
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("atribuir execução externa", () => {
  it("O.S. nova nasce como não-externa", async () => {
    expect((await ler(osExterna)).execucao_externa).toBe(false);
  });

  it.each([
    ["sem corpo", {}],
    ["externo: false", { externo: false }],
    ["externo como texto", { externo: "sim" }],
  ])("atribuir %s devolve 400", async (_nome, corpo) => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/atribuir`)).send(corpo);
    expect(res.status).toBe(400);
    expect((await ler(osExterna)).status).toBe("ABERTA");
  });

  it("empresa B não consegue marcar a O.S. da A como externa", async () => {
    await comoB(request(app).patch(`/ordens-servico/${osExterna}/atribuir`)).send({ externo: true });
    const os = await ler(osExterna);
    expect(os.status).toBe("ABERTA");
    expect(os.execucao_externa).toBe(false);
  });

  it("gestor marca como externa: sem técnico, com quem atribuiu vindo do token, sem notificar técnico", async () => {
    const antes = await pool.query(`SELECT COUNT(*)::int n FROM notificacoes WHERE usuario_id = $1`, [
      fx.A.tecnicoId,
    ]);

    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/atribuir`)).send({
      externo: true,
      id_atribuido_por: fx.B.adminId, // forjado: deve ser ignorado
    });
    expect(res.status).toBe(200);

    const os = await ler(osExterna);
    expect(os.execucao_externa).toBe(true);
    expect(os.id_tecnico).toBeNull();
    // o parceiro já está executando: vai direto para "em andamento" (o gestor não "inicia" atendimento)
    expect(os.status).toBe("EM_ANDAMENTO");
    expect(os.data_inicio_atendimento).not.toBeNull();
    expect(os.id_atribuido_por).toBe(fx.A.adminId);
    expect(os.data_atribuicao).not.toBeNull();

    const depois = await pool.query(`SELECT COUNT(*)::int n FROM notificacoes WHERE usuario_id = $1`, [
      fx.A.tecnicoId,
    ]);
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  it("não dá pra marcar de novo como externa (transição inválida)", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/atribuir`)).send({ externo: true });
    expect(res.status).toBe(400);
  });
});

describe("finalizar O.S. externa", () => {
  it("a O.S. externa já nasce em andamento: não precisa (nem pode) iniciar de novo", async () => {
    expect((await ler(osExterna)).status).toBe("EM_ANDAMENTO");
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/iniciar`));
    expect(res.status).toBe(400);
    expect((await ler(osExterna)).status).toBe("EM_ANDAMENTO");
  });

  it("sem parceiro é recusada (o backend agora exige, não só o front)", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/finalizar`)).send({
      resolucao: "feito",
      valor_gasto: 50,
    });
    expect(res.status).toBe(400);
    expect((await ler(osExterna)).status).toBe("EM_ANDAMENTO");
  });

  it("com parceiro de OUTRA empresa é recusada", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/finalizar`)).send({
      resolucao: "feito",
      id_parceiro: fx.B.parceiroId,
      valor_parceiro: 100,
    });
    expect(res.status).toBe(400);
    const os = await ler(osExterna);
    expect(os.status).toBe("EM_ANDAMENTO");
    expect(os.id_parceiro).toBeNull();
  });

  it("com parceiro da própria empresa finaliza e grava parceiro e valores", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osExterna}/finalizar`)).send({
      resolucao: "Trocado pelo parceiro",
      valor_gasto: 50,
      id_parceiro: fx.A.parceiroId,
      valor_parceiro: 150,
    });
    expect(res.status).toBe(200);

    const os = await ler(osExterna);
    expect(os.status).toBe("FINALIZADA");
    expect(os.id_parceiro).toBe(fx.A.parceiroId);
    expect(Number(os.valor_parceiro)).toBe(150);
    expect(Number(os.valor_gasto)).toBe(50);
    expect(os.execucao_externa).toBe(true);
    expect(os.id_tecnico).toBeNull();
  });
});

describe("O.S. com técnico normal", () => {
  it("atribuir a técnico continua funcionando e não marca como externa", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osNormal}/atribuir`)).send({
      id_tecnico: fx.A.tecnicoId,
    });
    expect(res.status).toBe(200);
    const os = await ler(osNormal);
    expect(os.id_tecnico).toBe(fx.A.tecnicoId);
    expect(os.execucao_externa).toBe(false);
    expect(os.id_atribuido_por).toBe(fx.A.adminId);
  });

  it("técnico de outra empresa continua sendo recusado", async () => {
    const outra = await novaOS(fx.A, `${fx.A.marcador}_os_outra`);
    await comoA(request(app).patch(`/ordens-servico/${outra}/atribuir`)).send({ id_tecnico: fx.B.tecnicoId });
    const os = await ler(outra);
    expect(os.id_tecnico).toBeNull();
    expect(os.status).toBe("ABERTA");
  });

  it("finalizar com parceiro é recusado quando a O.S. não é externa", async () => {
    await comoA(request(app).patch(`/ordens-servico/${osNormal}/iniciar`));
    const res = await comoA(request(app).patch(`/ordens-servico/${osNormal}/finalizar`)).send({
      resolucao: "feito",
      id_parceiro: fx.A.parceiroId,
      valor_parceiro: 10,
    });
    expect(res.status).toBe(400);
    expect((await ler(osNormal)).status).toBe("EM_ANDAMENTO");
  });

  it("finalizar sem parceiro funciona (fluxo normal)", async () => {
    const res = await comoA(request(app).patch(`/ordens-servico/${osNormal}/finalizar`)).send({
      resolucao: "Ajustado",
      valor_gasto: 20,
    });
    expect(res.status).toBe(200);
    const os = await ler(osNormal);
    expect(os.status).toBe("FINALIZADA");
    expect(os.id_parceiro).toBeNull();
  });
});

describe("dashboard e relatórios", () => {
  it("ranking de técnicos conta só o técnico de verdade, nunca a execução externa", async () => {
    const res = await comoA(request(app).get("/dashboard/gestor/ranking-tecnicos"));
    expect(res.status).toBe(200);

    const linhas: { nome: string; total: string | number }[] = res.body;
    const tecnico = linhas.find((l) => l.nome === `${fx.A.marcador}_tecnico`);
    expect(tecnico).toBeDefined();
    expect(Number(tecnico!.total)).toBe(1); // só a O.S. normal, não a externa
    expect(linhas.every((l) => !/externo/i.test(l.nome))).toBe(true);
  });

  it("histórico de O.S. mostra 'Externo - <parceiro>' no lugar do técnico", async () => {
    const res = await comoA(request(app).get("/relatorios/ordens-servico/preview"));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(`Externo - ${fx.A.marcador}_parceiro`);
  });

  it("empresa B não vê a O.S. externa nem o parceiro da A no relatório", async () => {
    const res = await comoB(request(app).get("/relatorios/ordens-servico/preview"));
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });
});

describe("outra empresa usa técnico externo sem nenhuma configuração", () => {
  it("empresa B (sem usuário 'externo' cadastrado) marca e finaliza O.S. externa", async () => {
    const os = await novaOS(fx.B, `${fx.B.marcador}_os_externa`);

    expect((await comoB(request(app).patch(`/ordens-servico/${os}/atribuir`)).send({ externo: true })).status).toBe(200);
    const fim = await comoB(request(app).patch(`/ordens-servico/${os}/finalizar`)).send({
      resolucao: "ok",
      id_parceiro: fx.B.parceiroId,
      valor_parceiro: 80,
    });
    expect(fim.status).toBe(200);
    expect((await ler(os)).status).toBe("FINALIZADA");
  });
});

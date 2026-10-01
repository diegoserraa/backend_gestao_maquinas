import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * "Preventivas Vencidas" (GET /dashboard/gestor/preventivas-vencidas) — redesenhado
 * depois de um feedback real do usuário: "preventiva atrasada é uma O.S. atrasada",
 * não "máquina com data passada". A lista agora parte das O.S. de preventiva
 * ABERTAS (não das máquinas), então sempre tem uma O.S. de verdade por trás pra o
 * front linkar direto — nunca cai num "sem O.S., vai pra máquina".
 */

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenGestor}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenGestor}`);
const comoTecnicoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenTecnico}`);

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

async function marcarVencida(maquinaId: number, diasAtraso: number) {
  const data = new Date();
  data.setDate(data.getDate() - diasAtraso);
  await pool.query(`UPDATE maquinas SET proxima_manutencao = $1 WHERE id = $2`, [
    data.toISOString().split("T")[0],
    maquinaId,
  ]);
}

async function marcarEmDia(maquinaId: number, diasNoFuturo: number) {
  const data = new Date();
  data.setDate(data.getDate() + diasNoFuturo);
  await pool.query(`UPDATE maquinas SET proxima_manutencao = $1 WHERE id = $2`, [
    data.toISOString().split("T")[0],
    maquinaId,
  ]);
}

async function criarPreventivaAberta(maquinaId: number, empresaId: string, status = "ABERTA") {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, empresa_id)
     VALUES ($1, 'preventiva de teste', $2, 'PREVENTIVA', 'MEDIA', NOW(), $3)
     RETURNING id`,
    [maquinaId, status, empresaId]
  );
  return rows[0].id as number;
}

async function limparPreventivasDaMaquina(maquinaId: number) {
  await pool.query(`DELETE FROM ordens_servico WHERE maquina_id = $1 AND tipo_manutencao = 'PREVENTIVA'`, [
    maquinaId,
  ]);
}

describe("GET /dashboard/gestor/preventivas-vencidas", () => {
  it("máquina vencida SEM nenhuma O.S. de preventiva não aparece na lista", async () => {
    await limparPreventivasDaMaquina(fx.A.maquinaId);
    await marcarVencida(fx.A.maquinaId, 5);

    const res = await comoA(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    expect(res.status).toBe(200);
    expect(res.body.maquinas.find((m: any) => m.maquina_id === fx.A.maquinaId)).toBeUndefined();
  });

  it("máquina vencida COM O.S. de preventiva aberta aparece, e o os_id é o da O.S. de verdade", async () => {
    await limparPreventivasDaMaquina(fx.A.maquinaId);
    await marcarVencida(fx.A.maquinaId, 5);
    const osId = await criarPreventivaAberta(fx.A.maquinaId, fx.A.empresaId);

    const res = await comoA(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    const item = res.body.maquinas.find((m: any) => m.maquina_id === fx.A.maquinaId);

    expect(item).toBeDefined();
    expect(item.os_id).toBe(osId);
    // >=4, não >=5: CURRENT_DATE do Postgres x "hoje" calculado em JS pode discordar
    // por 1 dia perto da virada de meia-noite UTC, dependendo do horário em que o
    // teste roda — a asserção real é "ficou atrasada", não o número exato de dias.
    expect(item.dias_atraso).toBeGreaterThanOrEqual(4);
  });

  it("máquina em dia (data futura) não aparece, mesmo com uma O.S. de preventiva aberta", async () => {
    await limparPreventivasDaMaquina(fx.B.maquinaId);
    await marcarEmDia(fx.B.maquinaId, 30);
    await criarPreventivaAberta(fx.B.maquinaId, fx.B.empresaId);

    const res = await comoB(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    expect(res.body.maquinas.find((m: any) => m.maquina_id === fx.B.maquinaId)).toBeUndefined();
  });

  it("O.S. de preventiva CANCELADA não conta — só status em aberto", async () => {
    await limparPreventivasDaMaquina(fx.A.maquinaId);
    await marcarVencida(fx.A.maquinaId, 3);
    await criarPreventivaAberta(fx.A.maquinaId, fx.A.empresaId, "CANCELADA");

    const res = await comoA(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    expect(res.body.maquinas.find((m: any) => m.maquina_id === fx.A.maquinaId)).toBeUndefined();
  });

  it("sem filtro de período: é sempre o estado atual, mesmo com datas que não batem na URL", async () => {
    await limparPreventivasDaMaquina(fx.A.maquinaId);
    await marcarVencida(fx.A.maquinaId, 5);
    await criarPreventivaAberta(fx.A.maquinaId, fx.A.empresaId);

    const res = await comoA(
      request(app).get("/dashboard/gestor/preventivas-vencidas?dataInicio=2000-01-01&dataFim=2000-01-02")
    );
    expect(res.body.maquinas.find((m: any) => m.maquina_id === fx.A.maquinaId)).toBeDefined();
  });

  it("empresa B nunca vê a preventiva atrasada da empresa A", async () => {
    await limparPreventivasDaMaquina(fx.A.maquinaId);
    await marcarVencida(fx.A.maquinaId, 5);
    await criarPreventivaAberta(fx.A.maquinaId, fx.A.empresaId);

    const res = await comoB(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });

  it("técnico sem a permissão de dashboard do gestor recebe 403", async () => {
    const res = await comoTecnicoA(request(app).get("/dashboard/gestor/preventivas-vencidas"));
    expect(res.status).toBe(403);
  });
});

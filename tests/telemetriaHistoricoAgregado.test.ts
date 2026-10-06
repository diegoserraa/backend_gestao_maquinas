import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * GET /telemetria/:maquinaId/historico-agregado — substitui o mock de
 * histórico do dashboard (sinal antes 100% simulado, sem relação com o
 * banco). Agrega telemetria_leituras por balde de tempo (date_trunc +
 * generate_series) direto no Postgres.
 */

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

async function inserirLeitura(
  empresaId: string,
  maquinaId: number,
  valores: { temperatura?: number; vibracao?: number; horas_ligadas?: number }
) {
  await pool.query(
    `INSERT INTO telemetria_leituras (maquina_id, temperatura, vibracao, horas_ligadas, empresa_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      maquinaId,
      valores.temperatura ?? null,
      valores.vibracao ?? null,
      valores.horas_ligadas ?? null,
      empresaId,
    ]
  );
}

describe("GET /telemetria/:maquinaId/historico-agregado", () => {
  it("faixa=1h devolve 24 baldes, com a leitura recém-inserida no último", async () => {
    await inserirLeitura(fx.A.empresaId, fx.A.maquinaId, { temperatura: 77.7 });

    const res = await comoA(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=1h&metrica=temperatura`)
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(24);

    const ultimo = res.body[res.body.length - 1];
    expect(Number(ultimo.media)).toBeCloseTo(77.7, 1);
    expect(Number(ultimo.minimo)).toBeCloseTo(77.7, 1);
    expect(Number(ultimo.maximo)).toBeCloseTo(77.7, 1);
  });

  it("horas_ligadas usa MAX (contador crescente), não média — sem banda", async () => {
    await inserirLeitura(fx.A.empresaId, fx.A.maquinaId, { horas_ligadas: 5 });
    await inserirLeitura(fx.A.empresaId, fx.A.maquinaId, { horas_ligadas: 8 });

    const res = await comoA(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=1h&metrica=horas_ligadas`)
    );

    const ultimo = res.body[res.body.length - 1];
    expect(Number(ultimo.media)).toBe(8);
    expect(Number(ultimo.minimo)).toBe(8);
    expect(Number(ultimo.maximo)).toBe(8);
  });

  it("balde sem nenhuma leitura vem com media/minimo/maximo nulos (não quebra, não inventa dado)", async () => {
    const res = await comoA(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=1h&metrica=vibracao`)
    );

    expect(res.status).toBe(200);
    expect(res.body[0].media).toBeNull();
  });

  it("faixa inválida -> 400", async () => {
    const res = await comoA(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=3h&metrica=temperatura`)
    );
    expect(res.status).toBe(400);
  });

  it("metrica inválida -> 400", async () => {
    const res = await comoA(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=1h&metrica=pressao`)
    );
    expect(res.status).toBe(400);
  });

  it("empresa B não enxerga a leitura da máquina da empresa A (mesmo pedindo o maquinaId dela)", async () => {
    const res = await comoB(
      request(app).get(`/telemetria/${fx.A.maquinaId}/historico-agregado?faixa=1h&metrica=temperatura`)
    );

    expect(res.status).toBe(200);
    // nenhum balde pode ter herdado o 77.7 da empresa A
    expect(res.body.every((p: any) => p.media === null || Number(p.media) !== 77.7)).toBe(true);
  });
});

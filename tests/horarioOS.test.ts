import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, Fixture } from "./helpers/fixture";

/**
 * Bug real de bancada: data_abertura (e outras datas de ordens_servico)
 * eram `timestamp SEM fuso`, diferente do resto do banco. O app grava
 * `new Date().toISOString()` nessas colunas — com a sessão do banco
 * configurada em America/Sao_Paulo, isso descasava em exatos 3h (o fuso
 * do Brasil) entre o horário real e o que a API devolvia. Corrigido
 * convertendo as colunas pra timestamptz (migration 2026_10_08).
 *
 * Esse teste trava o horário: cria uma O.S. de verdade pela API e
 * confirma que data_abertura bate com a hora real, com folga de alguns
 * segundos só pra latência da própria chamada (nunca ~3h de diferença,
 * pra qualquer lado).
 */

let fx: Fixture;

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("Horário de abertura de O.S.", () => {
  it("data_abertura devolvida pela API bate com a hora real (não com ±3h de diferença)", async () => {
    const antes = Date.now();

    const res = await request(app)
      .post("/ordens-servico")
      .set("Authorization", `Bearer ${fx.A.tokenAdmin}`)
      .send({
        maquina_id: fx.A.maquinaId,
        descricao: "teste de horário",
        tipo_manutencao: "CORRETIVA",
        prioridade: "MEDIA",
      });

    const depois = Date.now();

    expect(res.status).toBe(201);

    const dataAberturaMs = new Date(res.body.data_abertura).getTime();

    // folga de 10s só pra latência real da requisição — nunca deveria
    // chegar perto de 3h (10800000ms) de diferença pra nenhum lado
    expect(dataAberturaMs).toBeGreaterThanOrEqual(antes - 10_000);
    expect(dataAberturaMs).toBeLessThanOrEqual(depois + 10_000);
  });
});

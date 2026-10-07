import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MonitoramentoRepository } from "../src/repositories/MonitoramentoRepository";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Bug real encontrado em bancada: duas avaliações de alerta quase
 * simultâneas (leituras MQTT próximas, ou até dois processos durante um
 * redeploy) criavam DUAS linhas 'aberto' pro mesmo (maquina_id, chave) —
 * a proteção antiga era só a fila em memória de MonitoramentoService, que
 * não protege contra corrida entre processos. Corrigido com um índice
 * único parcial no banco (migrations/2026_10_06_alerta_unico_aberto.sql)
 * + ON CONFLICT DO NOTHING em criarAlerta.
 */

let fx: Fixture;
const repo = new MonitoramentoRepository();

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("MonitoramentoRepository.criarAlerta — não duplica alerta 'aberto' concorrente", () => {
  it("duas chamadas simultâneas pra mesma (máquina, chave) resultam em só 1 linha 'aberto'", async () => {
    const payload = {
      maquina_id: fx.A.maquinaId,
      chave: "vibracao" as const,
      nivel: "critico" as const,
      valor: 8.18,
      limite: 1,
      status: "aberto" as const,
      ordem_servico_id: null,
      detalhe: "teste de concorrência",
    };

    const [a, b] = await Promise.all([
      repo.criarAlerta(payload),
      repo.criarAlerta(payload),
    ]);

    // as duas chamadas devem apontar pro MESMO alerta (a segunda reaproveita)
    expect(a.id).toBe(b.id);

    const { rows } = await pool.query(
      `SELECT id FROM telemetria_alertas WHERE maquina_id = $1 AND chave = 'vibracao' AND status = 'aberto'`,
      [fx.A.maquinaId]
    );
    expect(rows).toHaveLength(1);
  });
});

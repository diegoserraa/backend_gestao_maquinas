import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Relatório "Produtividade por Técnico" — uma linha por técnico ativo.
 * Duas famílias de números: "no período" (finalizadas, tempo médio de
 * atendimento) e "agora" (os_em_aberto, nunca filtrado por período —
 * é a fila atual, não histórico).
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

async function criarOS(
  empresaId: string,
  maquinaId: number,
  idTecnico: number | null,
  opcoes: {
    status?: string;
    prioridade?: string;
    dataAbertura?: Date;
    dataInicioAtendimento?: Date | null;
    dataResolucao?: Date | null;
    tempoPausadoSegundos?: number;
  } = {}
) {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura,
        data_inicio_atendimento, data_resolucao, tempo_pausado_segundos, id_tecnico, empresa_id)
     VALUES ($1, 'teste produtividade', $2, 'CORRETIVA', $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      maquinaId,
      opcoes.status ?? "ABERTA",
      opcoes.prioridade ?? "MEDIA",
      opcoes.dataAbertura ?? new Date(),
      opcoes.dataInicioAtendimento ?? null,
      opcoes.dataResolucao ?? null,
      opcoes.tempoPausadoSegundos ?? 0,
      idTecnico,
      empresaId,
    ]
  );
  return rows[0].id as number;
}

describe("GET /relatorios/tecnicos/preview", () => {
  it("técnico sem nenhuma O.S. ainda aparece na lista, zerado", async () => {
    const res = await comoA(request(app).get("/relatorios/tecnicos/preview"));
    expect(res.status).toBe(200);

    const linha = res.body.find((t: any) => t.tecnico_id === fx.A.tecnico2Id);
    expect(linha).toBeDefined();
    expect(Number(linha.os_finalizadas)).toBe(0);
    expect(Number(linha.os_em_aberto)).toBe(0);
    expect(linha.tempo_medio_atendimento_segundos).toBeNull();
  });

  it("conta finalizadas e tempo médio de atendimento (descontando pausa) no período", async () => {
    const inicio = new Date("2026-05-10T12:00:00Z");
    const fim = new Date("2026-05-10T13:00:00Z"); // 1h de atendimento
    await criarOS(fx.A.empresaId, fx.A.maquinaId, fx.A.tecnicoId, {
      status: "FINALIZADA",
      prioridade: "ALTA",
      dataAbertura: inicio,
      dataInicioAtendimento: inicio,
      dataResolucao: fim,
      tempoPausadoSegundos: 600, // 10min pausado -> tempo líquido = 50min = 3000s
    });

    const res = await comoA(
      request(app).get("/relatorios/tecnicos/preview?dataInicial=2026-05-10&dataFinal=2026-05-10")
    );
    expect(res.status).toBe(200);

    const linha = res.body.find((t: any) => t.tecnico_id === fx.A.tecnicoId);
    expect(Number(linha.os_finalizadas)).toBe(1);
    expect(Number(linha.os_finalizadas_prioritarias)).toBe(1); // era ALTA
    expect(Number(linha.tempo_medio_atendimento_segundos)).toBeCloseTo(3000, 0);
  });

  it("os_em_aberto reflete o estado ATUAL, não é afetado pelo filtro de período", async () => {
    await criarOS(fx.A.empresaId, fx.A.maquinaId, fx.A.tecnicoId, {
      status: "EM_ANDAMENTO",
      dataAbertura: new Date("2020-01-01T00:00:00Z"), // bem fora de qualquer filtro de período
    });

    // filtra um período que não inclui 2020 — mesmo assim a carga atual deve aparecer
    const res = await comoA(
      request(app).get("/relatorios/tecnicos/preview?dataInicial=2026-05-10&dataFinal=2026-05-10")
    );
    const linha = res.body.find((t: any) => t.tecnico_id === fx.A.tecnicoId);
    expect(Number(linha.os_em_aberto)).toBeGreaterThanOrEqual(1);
  });

  it("empresa B não vê técnico da empresa A", async () => {
    const res = await comoB(request(app).get("/relatorios/tecnicos/preview"));
    expect(res.status).toBe(200);
    const vazou = res.body.some((t: any) => t.tecnico_id === fx.A.tecnicoId);
    expect(vazou).toBe(false);
  });

  it("sem permissão de relatórios recebe 403", async () => {
    const res = await request(app)
      .get("/relatorios/tecnicos/preview")
      .set("Authorization", `Bearer ${fx.A.tokenOperador}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /relatorios/tecnicos — exportar Excel", () => {
  it("exporta com status 200 e content-type de planilha", async () => {
    const res = await comoA(request(app).get("/relatorios/tecnicos"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
  });
});

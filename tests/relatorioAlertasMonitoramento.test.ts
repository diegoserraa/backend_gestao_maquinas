import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Relatório "Alertas de Monitoramento" — uma linha por alerta (igual
 * Histórico de O.S.), incluindo os que NUNCA viraram O.S. (hoje só
 * existem na tela ao vivo de Alertas, sem histórico consultável).
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

async function criarAlerta(
  empresaId: string,
  maquinaId: number,
  opcoes: {
    chave?: string;
    nivel?: string;
    valor?: number;
    limite?: number;
    status?: string;
    ordemServicoId?: number | null;
    abertoEm?: Date;
    resolvidoEm?: Date | null;
  } = {}
) {
  const { rows } = await pool.query(
    `INSERT INTO telemetria_alertas
       (maquina_id, chave, nivel, valor, limite, status, ordem_servico_id, aberto_em, resolvido_em, empresa_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      maquinaId,
      opcoes.chave ?? "temperatura",
      opcoes.nivel ?? "critico",
      opcoes.valor ?? 85,
      opcoes.limite ?? 80,
      opcoes.status ?? "resolvido",
      opcoes.ordemServicoId ?? null,
      opcoes.abertoEm ?? new Date(),
      opcoes.resolvidoEm ?? null,
      empresaId,
    ]
  );
  return rows[0].id as number;
}

describe("GET /relatorios/alertas/preview", () => {
  it("traz um alerta que nunca virou O.S. (invisível no relatório de O.S.)", async () => {
    const abertoEm = new Date("2026-06-01T12:00:00Z");
    const resolvidoEm = new Date("2026-06-01T12:05:00Z"); // 5min depois
    const id = await criarAlerta(fx.A.empresaId, fx.A.maquinaId, {
      chave: "vibracao",
      nivel: "atencao",
      valor: 0.5,
      limite: 0.3,
      status: "resolvido",
      ordemServicoId: null,
      abertoEm,
      resolvidoEm,
    });

    const res = await comoA(
      request(app).get("/relatorios/alertas/preview?dataInicial=2026-06-01&dataFinal=2026-06-01")
    );
    expect(res.status).toBe(200);

    const linha = res.body.find((a: any) => a.id === id);
    expect(linha).toBeDefined();
    expect(linha.maquina_nome).toBe(`${fx.A.marcador}_maquina`);
    expect(linha.chave).toBe("vibracao");
    expect(linha.ordem_servico_id).toBeNull();
    expect(Number(linha.duracao_segundos)).toBeCloseTo(300, 0); // 5min
  });

  it("filtro de período exclui alerta de fora do intervalo", async () => {
    await criarAlerta(fx.A.empresaId, fx.A.maquinaId, {
      abertoEm: new Date("2020-01-01T00:00:00Z"),
      resolvidoEm: new Date("2020-01-01T00:10:00Z"),
    });

    const res = await comoA(
      request(app).get("/relatorios/alertas/preview?dataInicial=2026-06-01&dataFinal=2026-06-01")
    );
    const temAlertaAntigo = res.body.some(
      (a: any) => new Date(a.aberto_em).getFullYear() === 2020
    );
    expect(temAlertaAntigo).toBe(false);
  });

  it("empresa B não vê alerta da empresa A", async () => {
    const res = await comoB(request(app).get("/relatorios/alertas/preview"));
    expect(res.status).toBe(200);
    const vazou = res.body.some((a: any) => a.maquina_nome?.includes(fx.A.marcador));
    expect(vazou).toBe(false);
  });

  it("sem permissão de relatórios recebe 403", async () => {
    const res = await request(app)
      .get("/relatorios/alertas/preview")
      .set("Authorization", `Bearer ${fx.A.tokenOperador}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /relatorios/alertas — exportar Excel", () => {
  it("exporta com status 200 e content-type de planilha", async () => {
    const res = await comoA(request(app).get("/relatorios/alertas"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
  });
});

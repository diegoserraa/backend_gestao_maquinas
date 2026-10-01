import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Relatório "Histórico de O.S." ganhou, a pedido do usuário, a coluna/filtro de
 * "máquina parada" — em vez de um relatório novo e redundante (a parada já é o
 * próprio ciclo de vida da O.S., "Histórico de O.S." filtrado por maquina_parada
 * já é esse relatório). Cobre o filtro apenasParada, as colunas novas e isolamento.
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
  opcoes: { maquinaParada?: boolean; motivoParada?: string; finalizada?: boolean } = {}
) {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, data_resolucao,
        maquina_parada, motivo_parada, empresa_id)
     VALUES ($1, 'teste relatorio parada', $2, 'CORRETIVA', 'MEDIA',
             NOW() - interval '3 hours', $3, $4, $5, $6)
     RETURNING id`,
    [
      maquinaId,
      opcoes.finalizada ? "FINALIZADA" : "ABERTA",
      opcoes.finalizada ? new Date() : null,
      opcoes.maquinaParada ?? false,
      opcoes.maquinaParada ? opcoes.motivoParada ?? "motivo de teste" : null,
      empresaId,
    ]
  );
  return rows[0].id as number;
}

describe("GET /relatorios/ordens-servico/preview — filtro e colunas de máquina parada", () => {
  it("sem o filtro: traz as duas, mas só a parada tem motivo/tempo_parado", async () => {
    const idParada = await criarOS(fx.A.empresaId, fx.A.maquinaId, {
      maquinaParada: true,
      motivoParada: "correia rompida",
    });
    const idNormal = await criarOS(fx.A.empresaId, fx.A.maquinaId);

    const res = await comoA(request(app).get("/relatorios/ordens-servico/preview"));
    expect(res.status).toBe(200);

    const parada = res.body.find((o: any) => o.id === idParada);
    const normal = res.body.find((o: any) => o.id === idNormal);

    expect(parada).toBeDefined();
    expect(parada.maquina_parada).toBe(true);
    expect(parada.motivo_parada).toBe("correia rompida");
    expect(Number(parada.tempo_parado_segundos)).toBeGreaterThan(0);

    expect(normal).toBeDefined();
    expect(normal.maquina_parada).toBe(false);
    expect(normal.tempo_parado_segundos).toBeNull();
  });

  it("com apenasParada=true: só traz as marcadas como máquina parada", async () => {
    const res = await comoA(
      request(app).get("/relatorios/ordens-servico/preview?apenasParada=true")
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.maquina_parada === true)).toBe(true);
  });

  it("tempo_parado_segundos para de crescer quando a O.S. é finalizada (igual ao Dashboard)", async () => {
    const id = await criarOS(fx.A.empresaId, fx.A.maquinaId, {
      maquinaParada: true,
      motivoParada: "finalizada",
      finalizada: true,
    });

    const res = await comoA(request(app).get("/relatorios/ordens-servico/preview"));
    const item = res.body.find((o: any) => o.id === id);

    expect(item.maquina_parada).toBe(true);
    // ~3h (abriu 3h atrás, "resolveu" agora) — não deve continuar subindo depois disso
    expect(Number(item.tempo_parado_segundos)).toBeGreaterThan(3600 * 2.9);
    expect(Number(item.tempo_parado_segundos)).toBeLessThan(3600 * 3.1);
  });

  it("empresa B nunca vê a O.S. parada da empresa A", async () => {
    const res = await comoB(request(app).get("/relatorios/ordens-servico/preview?apenasParada=true"));
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
    expect(JSON.stringify(res.body)).not.toContain("correia rompida");
  });

  it("sem permissão de relatórios recebe 403", async () => {
    const res = await request(app)
      .get("/relatorios/ordens-servico/preview")
      .set("Authorization", `Bearer ${fx.A.tokenOperador}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /relatorios/ordens-servico — exportar Excel continua funcionando com as colunas novas", () => {
  it("exporta com status 200 e o content-type de planilha", async () => {
    const res = await comoA(request(app).get("/relatorios/ordens-servico?apenasParada=true"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
  });
});

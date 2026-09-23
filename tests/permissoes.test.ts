import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Regras de papel nas O.S. (antes só o front escondia os botões):
 *  ADMIN/GESTOR fazem tudo; TECNICO assume pra si e mexe só na O.S. dele;
 *  OPERADOR só abre O.S. e consulta.
 */

let fx: Fixture;

const com = (token: string) => (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
const operador = () => com(fx.A.tokenOperador);
const tecnico = () => com(fx.A.tokenTecnico);
const tecnico2 = () => com(fx.A.tokenTecnico2);
const gestor = () => com(fx.A.tokenGestor);
const admin = () => com(fx.A.tokenAdmin);

async function novaOS(extra: { status?: string; id_tecnico?: number | null } = {}): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_solicitante, id_tecnico, empresa_id)
     VALUES ($1,$2,$3,'CORRETIVA','ALTA', NOW(), $4, $5, $6) RETURNING id`,
    [fx.A.maquinaId, `${fx.A.marcador}_os`, extra.status ?? "ABERTA", fx.A.adminId, extra.id_tecnico ?? null, fx.A.empresaId]
  );
  return rows[0].id;
}

async function ler(id: number) {
  const { rows } = await pool.query(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
  return rows[0];
}

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("OPERADOR só abre e consulta", () => {
  it("consulta a lista e uma O.S.", async () => {
    const os = await novaOS();
    expect((await operador()(request(app).get("/ordens-servico"))).status).toBe(200);
    expect((await operador()(request(app).get(`/ordens-servico/${os}`))).status).toBe(200);
  });

  it("abre O.S.: solicitante é ele mesmo (mesmo que forje outro) e não escolhe técnico", async () => {
    const res = await operador()(request(app).post("/ordens-servico")).send({
      maquina_id: fx.A.maquinaId,
      descricao: `${fx.A.marcador}_aberta_pelo_operador`,
      tipo_manutencao: "CORRETIVA",
      prioridade: "MEDIA",
      id_solicitante: fx.A.adminId,
      id_tecnico: fx.A.tecnicoId,
    });
    expect(res.status).toBe(201);
    const os = await ler(res.body.id);
    expect(os.id_solicitante).toBe(fx.A.operadorId);
    expect(os.id_tecnico).toBeNull();
  });

  const acoes: [string, string, object][] = [
    ["atribuir técnico", "atribuir", { id_tecnico: 0 }],
    ["marcar como externa", "atribuir", { externo: true }],
    ["iniciar", "iniciar", {}],
    ["pausar", "pausar", {}],
    ["finalizar", "finalizar", { resolucao: "x" }],
    ["cancelar", "cancelar", { motivo_cancelamento: "x" }],
    ["mudar prioridade", "prioridade", { prioridade: "BAIXA" }],
  ];

  it.each(acoes)("não consegue %s (403) e a O.S. não muda", async (_nome, rota, corpo) => {
    const os = await novaOS({ status: "EM_ANDAMENTO", id_tecnico: fx.A.tecnicoId });
    const body = rota === "atribuir" && "id_tecnico" in corpo ? { id_tecnico: fx.A.tecnicoId } : corpo;
    const res = await operador()(request(app).patch(`/ordens-servico/${os}/${rota}`)).send(body);
    expect(res.status).toBe(403);
    const depois = await ler(os);
    expect(depois.status).toBe("EM_ANDAMENTO");
    expect(depois.prioridade).toBe("ALTA");
    expect(depois.execucao_externa).toBe(false);
  });

  it("não edita nem apaga O.S.", async () => {
    const os = await novaOS();
    const put = await operador()(request(app).put(`/ordens-servico/${os}`)).send({ maquina_id: fx.A.maquinaId, descricao: "HACK" });
    const del = await operador()(request(app).delete(`/ordens-servico/${os}`));
    expect(put.status).toBe(403);
    expect(del.status).toBe(403);
    expect((await ler(os)).descricao).toBe(`${fx.A.marcador}_os`);
  });
});

describe("TECNICO só mexe no que é dele", () => {
  it("assume uma O.S. aberta pra si mesmo", async () => {
    const os = await novaOS();
    const res = await tecnico()(request(app).patch(`/ordens-servico/${os}/atribuir`)).send({ id_tecnico: fx.A.tecnicoId });
    expect(res.status).toBe(200);
    expect((await ler(os)).id_tecnico).toBe(fx.A.tecnicoId);
  });

  it("não atribui a O.S. a outro técnico", async () => {
    const os = await novaOS();
    const res = await tecnico()(request(app).patch(`/ordens-servico/${os}/atribuir`)).send({ id_tecnico: fx.A.tecnico2Id });
    expect(res.status).toBe(403);
    expect((await ler(os)).id_tecnico).toBeNull();
  });

  it("não marca O.S. como execução externa", async () => {
    const os = await novaOS();
    const res = await tecnico()(request(app).patch(`/ordens-servico/${os}/atribuir`)).send({ externo: true });
    expect(res.status).toBe(403);
    expect((await ler(os)).execucao_externa).toBe(false);
  });

  it("inicia e finaliza a O.S. dele", async () => {
    const os = await novaOS({ status: "ATRIBUIDA", id_tecnico: fx.A.tecnicoId });
    expect((await tecnico()(request(app).patch(`/ordens-servico/${os}/iniciar`))).status).toBe(200);
    const fim = await tecnico()(request(app).patch(`/ordens-servico/${os}/finalizar`)).send({ resolucao: "feito", valor_gasto: 10 });
    expect(fim.status).toBe(200);
    expect((await ler(os)).status).toBe("FINALIZADA");
  });

  it("não inicia, pausa nem finaliza a O.S. de OUTRO técnico", async () => {
    const os = await novaOS({ status: "EM_ANDAMENTO", id_tecnico: fx.A.tecnico2Id });
    for (const [rota, corpo] of [
      ["iniciar", {}],
      ["pausar", {}],
      ["finalizar", { resolucao: "x" }],
    ] as [string, object][]) {
      const res = await tecnico()(request(app).patch(`/ordens-servico/${os}/${rota}`)).send(corpo);
      expect(res.status, rota).toBe(403);
    }
    expect((await ler(os)).status).toBe("EM_ANDAMENTO");
  });

  it("não mexe em O.S. de execução externa (mesmo que o id_tecnico coincida)", async () => {
    const os = await novaOS({ status: "EM_ANDAMENTO" });
    await pool.query(`UPDATE ordens_servico SET execucao_externa = true WHERE id = $1`, [os]);
    const res = await tecnico()(request(app).patch(`/ordens-servico/${os}/finalizar`)).send({ resolucao: "x" });
    expect(res.status).toBe(403);
  });

  it("não cancela, não muda prioridade, não edita e não apaga", async () => {
    const os = await novaOS({ status: "EM_ANDAMENTO", id_tecnico: fx.A.tecnicoId });
    expect((await tecnico()(request(app).patch(`/ordens-servico/${os}/cancelar`)).send({ motivo_cancelamento: "x" })).status).toBe(403);
    expect((await tecnico()(request(app).patch(`/ordens-servico/${os}/prioridade`)).send({ prioridade: "BAIXA" })).status).toBe(403);
    expect((await tecnico()(request(app).put(`/ordens-servico/${os}`)).send({ maquina_id: fx.A.maquinaId, descricao: "H" })).status).toBe(403);
    expect((await tecnico()(request(app).delete(`/ordens-servico/${os}`))).status).toBe(403);
    const depois = await ler(os);
    expect(depois.status).toBe("EM_ANDAMENTO");
    expect(depois.prioridade).toBe("ALTA");
  });

  it("O.S. inexistente devolve o erro normal de 'não encontrada', não 403", async () => {
    const res = await tecnico()(request(app).patch(`/ordens-servico/2147483000/iniciar`));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/não encontrada/i);
  });

  it("ao abrir O.S. não escolhe técnico", async () => {
    const res = await tecnico()(request(app).post("/ordens-servico")).send({
      maquina_id: fx.A.maquinaId,
      descricao: `${fx.A.marcador}_aberta_pelo_tecnico`,
      tipo_manutencao: "CORRETIVA",
      prioridade: "MEDIA",
      id_tecnico: fx.A.tecnico2Id,
    });
    expect(res.status).toBe(201);
    expect((await ler(res.body.id)).id_tecnico).toBeNull();
  });
});

describe("GESTOR e ADMIN têm acesso total", () => {
  it.each([
    ["GESTOR", gestor],
    ["ADMIN", admin],
  ])("%s atribui, marca externa, muda prioridade, edita, cancela e apaga", async (_papel, quem) => {
    const a = await novaOS();
    expect((await quem()(request(app).patch(`/ordens-servico/${a}/atribuir`)).send({ id_tecnico: fx.A.tecnico2Id })).status).toBe(200);

    const b = await novaOS();
    expect((await quem()(request(app).patch(`/ordens-servico/${b}/atribuir`)).send({ externo: true })).status).toBe(200);

    const c = await novaOS();
    expect((await quem()(request(app).patch(`/ordens-servico/${c}/prioridade`)).send({ prioridade: "BAIXA" })).status).toBe(200);
    expect((await quem()(request(app).patch(`/ordens-servico/${c}/cancelar`)).send({ motivo_cancelamento: "não precisa mais" })).status).toBe(200);

    const d = await novaOS();
    expect(
      (await quem()(request(app).put(`/ordens-servico/${d}`)).send({
        maquina_id: fx.A.maquinaId, descricao: "editada", status: "ABERTA", prioridade: "ALTA", tipo_manutencao: "CORRETIVA",
      })).status
    ).toBe(200);
    expect((await quem()(request(app).delete(`/ordens-servico/${d}`))).status).toBe(204);
  });

  it("gestor inicia e finaliza a O.S. (como no fluxo de técnico externo)", async () => {
    const os = await novaOS();
    await gestor()(request(app).patch(`/ordens-servico/${os}/atribuir`)).send({ externo: true });
    expect((await gestor()(request(app).patch(`/ordens-servico/${os}/iniciar`))).status).toBe(200);
    const fim = await gestor()(request(app).patch(`/ordens-servico/${os}/finalizar`)).send({
      resolucao: "ok", id_parceiro: fx.A.parceiroId, valor_parceiro: 5,
    });
    expect(fim.status).toBe(200);
  });
});

describe("monitoramento", () => {
  const param = [{ chave: "temperatura", unidade: "C", minimo: null, atencao: 70, alarme: 90, janela_seg: 60, abrir_os_auto: false, ativo: true }];

  it("operador e técnico não configuram limites de alerta", async () => {
    const url = `/monitoramento/maquinas/${fx.A.maquinaId}/parametros`;
    expect((await operador()(request(app).put(url)).send(param)).status).toBe(403);
    expect((await tecnico()(request(app).put(url)).send(param)).status).toBe(403);
    expect((await operador()(request(app).delete(`${url}/temperatura`))).status).toBe(403);
  });

  it("gestor configura limites; todos os papéis consultam", async () => {
    const url = `/monitoramento/maquinas/${fx.A.maquinaId}/parametros`;
    expect((await gestor()(request(app).put(url)).send(param)).status).toBe(200);
    expect((await operador()(request(app).get(url))).status).toBe(200);
    expect((await operador()(request(app).get("/monitoramento/alertas"))).status).toBe(200);
  });

  it("operador não resolve alerta nem abre O.S. a partir dele", async () => {
    expect((await operador()(request(app).patch("/monitoramento/alertas/1/resolver"))).status).toBe(403);
    expect((await operador()(request(app).post("/monitoramento/alertas/1/abrir-os")).send({})).status).toBe(403);
  });
});

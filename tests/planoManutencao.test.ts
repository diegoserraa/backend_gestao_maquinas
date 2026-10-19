import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";
import { ManutencaoPreventivaService } from "../src/services/ManutencaoPreventivaService";
import { MaquinaRepository } from "../src/repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../src/repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../src/repositories/UsuarioRepository";
import { PlanoManutencaoRepository } from "../src/repositories/PlanoManutencaoRepository";
import { NotificacaoSistemaService } from "../src/services/notificacaoSistemaService";
import { NotificacaoService } from "../src/services/NotificacaoService";
import { PushNotificationService } from "../src/services/PushNotificationService";

/**
 * Planos de manutenção preventiva: várias regras independentes por máquina
 * (cada uma com sua própria tarefa e ritmo — dias OU horas de operação),
 * em vez do campo único legado (intervalo_manutencao_dias na máquina).
 */

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);
const comoOperadorA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenOperador}`);

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("CRUD de planos de manutenção", () => {
  it("cria plano por dias", async () => {
    const res = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Troca de óleo",
        tipo_gatilho: "DIAS",
        intervalo_dias: 90,
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.tipo_gatilho).toBe("DIAS");
    expect(res.body.proxima_data).toBeTruthy();
    // a data devolvida tem que ser parseável de verdade (regressão: já saiu
    // em formato que virava "Invalid Date" no front)
    expect(Number.isNaN(new Date(res.body.proxima_data).getTime())).toBe(false);
  });

  it("com 'última manutenção' informada, calcula a partir dela em vez de hoje", async () => {
    const vinteDiasAtras = new Date();
    vinteDiasAtras.setDate(vinteDiasAtras.getDate() - 20);
    const ultimaManutencao = vinteDiasAtras.toISOString().slice(0, 10);

    const res = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Com histórico",
        tipo_gatilho: "DIAS",
        intervalo_dias: 90,
        ultima_manutencao: ultimaManutencao,
      })
    );
    expect(res.status).toBe(201);

    const esperada = new Date(vinteDiasAtras);
    esperada.setDate(esperada.getDate() + 90);

    const recebida = new Date(res.body.proxima_data);
    expect(recebida.toISOString().slice(0, 10)).toBe(esperada.toISOString().slice(0, 10));

    // a data informada fica guardada de verdade (não é só usada pro cálculo e descartada)
    expect(new Date(res.body.ultima_manutencao).toISOString().slice(0, 10)).toBe(ultimaManutencao);
  });

  it("'avançar' o plano (O.S. finalizada) grava hoje como a nova 'última manutenção'", async () => {
    const criado = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Plano pra avançar última manutenção",
        tipo_gatilho: "DIAS",
        intervalo_dias: 10,
      })
    );
    const planoId = criado.body.id;
    expect(criado.body.ultima_manutencao).toBeFalsy(); // ninguém informou ainda

    const osRes = await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, empresa_id, plano_manutencao_id)
       VALUES ($1,'teste','EM_ANDAMENTO','PREVENTIVA','MEDIA', NOW(), $2, $3) RETURNING id`,
      [fx.A.maquinaId, fx.A.empresaId, planoId]
    );
    await comoA(request(app).patch(`/ordens-servico/${osRes.rows[0].id}/finalizar`).send({ resolucao: "feito" }));

    const lista = await comoA(request(app).get(`/maquinas/${fx.A.maquinaId}/planos-manutencao`));
    const atualizado = lista.body.find((p: any) => p.id === planoId);

    // compara com o CURRENT_DATE do próprio banco (fuso America/Sao_Paulo,
    // configurado em connection.ts) — "new Date().toISOString()" é UTC puro
    // e diverge do banco por ~3h todo dia (entre meia-noite UTC e meia-noite BR)
    const { rows: [{ hoje }] } = await pool.query<{ hoje: string }>(`SELECT CURRENT_DATE::text AS hoje`);
    expect(new Date(atualizado.ultima_manutencao).toISOString().slice(0, 10)).toBe(hoje);
  });

  it("rejeita HORAS se a única leitura de horímetro é antiga (sensor testado uma vez e nunca mais)", async () => {
    // simula uma leitura de 10 dias atrás — sensor não está "ativo" de verdade
    await pool.query(
      `UPDATE telemetria_atual SET atualizado_em = now() - interval '10 days' WHERE maquina_id = $1`,
      [fx.B.maquinaId]
    );

    const res = await comoB(
      request(app).post(`/maquinas/${fx.B.maquinaId}/planos-manutencao`).send({
        descricao: "Não devia criar",
        tipo_gatilho: "HORAS",
        intervalo_horas: 100,
      })
    );
    expect(res.status).toBe(400);

    // devolve pro normal (now()) pra não atrapalhar os outros testes deste arquivo
    await pool.query(`UPDATE telemetria_atual SET atualizado_em = now() WHERE maquina_id = $1`, [fx.B.maquinaId]);
  });

  it("cria plano por horas, usando o horímetro atual da máquina como referência", async () => {
    const res = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Verificar correias",
        tipo_gatilho: "HORAS",
        intervalo_horas: 500,
      })
    );
    expect(res.status).toBe(201);
    // fixture grava horas_ligadas = 10 em telemetria_atual
    expect(Number(res.body.horas_referencia)).toBeCloseTo(10, 0);
  });

  it("rejeita HORAS sem intervalo_horas", async () => {
    const res = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Sem intervalo",
        tipo_gatilho: "HORAS",
      })
    );
    expect(res.status).toBe(400);
  });

  it("lista vários planos independentes da mesma máquina", async () => {
    const res = await comoA(request(app).get(`/maquinas/${fx.A.maquinaId}/planos-manutencao`));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("empresa B não vê nem edita plano da empresa A", async () => {
    const criado = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Isolamento",
        tipo_gatilho: "DIAS",
        intervalo_dias: 30,
      })
    );
    const planoId = criado.body.id;

    const editarB = await comoB(
      request(app).put(`/maquinas/${fx.A.maquinaId}/planos-manutencao/${planoId}`).send({
        descricao: "Hackeado",
        tipo_gatilho: "DIAS",
        intervalo_dias: 1,
      })
    );
    expect(editarB.status).toBe(404);

    const listaB = await comoB(request(app).get(`/maquinas/${fx.A.maquinaId}/planos-manutencao`));
    // máquina de outra empresa: o próprio buscarPorId da máquina já barra
    expect(listaB.status).toBe(404);
  });

  it("sem permissão de editar máquina recebe 403 ao criar plano", async () => {
    const res = await comoOperadorA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "x",
        tipo_gatilho: "DIAS",
        intervalo_dias: 10,
      })
    );
    expect(res.status).toBe(403);
  });

  it("atualiza e exclui plano", async () => {
    const criado = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Pra editar",
        tipo_gatilho: "DIAS",
        intervalo_dias: 15,
      })
    );
    const id = criado.body.id;

    const editado = await comoA(
      request(app).put(`/maquinas/${fx.A.maquinaId}/planos-manutencao/${id}`).send({
        descricao: "Editado",
        tipo_gatilho: "DIAS",
        intervalo_dias: 20,
      })
    );
    expect(editado.status).toBe(200);
    expect(editado.body.descricao).toBe("Editado");

    const excluido = await comoA(request(app).delete(`/maquinas/${fx.A.maquinaId}/planos-manutencao/${id}`));
    expect(excluido.status).toBe(204);

    const lista = await comoA(request(app).get(`/maquinas/${fx.A.maquinaId}/planos-manutencao`));
    expect(lista.body.some((p: any) => p.id === id)).toBe(false);
  });
});

describe("'aproveitar plano de manutenção' (clonar de outra máquina)", () => {
  it("copia planos ativos pra outra máquina da mesma empresa", async () => {
    const setorRes = await pool.query(`SELECT id FROM setores WHERE empresa_id = $1 LIMIT 1`, [fx.A.empresaId]);
    const novaMaquina = await pool.query(
      `INSERT INTO maquinas (nome, modelo, setor_id, empresa_id) VALUES ($1,'modelo teste',$2,$3) RETURNING id`,
      [`${fx.A.marcador}_maquina_destino`, setorRes.rows[0].id, fx.A.empresaId]
    );
    const destinoId = novaMaquina.rows[0].id;

    const res = await comoA(
      request(app).post(`/maquinas/${destinoId}/planos-manutencao/clonar`).send({
        maquina_origem_id: fx.A.maquinaId,
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.criados.length).toBeGreaterThan(0);

    const lista = await comoA(request(app).get(`/maquinas/${destinoId}/planos-manutencao`));
    expect(lista.body.length).toBe(res.body.criados.length);
  });

  it("rejeita clonar da própria máquina", async () => {
    const res = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao/clonar`).send({
        maquina_origem_id: fx.A.maquinaId,
      })
    );
    expect(res.status).toBe(400);
  });

  it("não deixa clonar plano de máquina de outra empresa", async () => {
    const setorRes = await pool.query(`SELECT id FROM setores WHERE empresa_id = $1 LIMIT 1`, [fx.A.empresaId]);
    const novaMaquina = await pool.query(
      `INSERT INTO maquinas (nome, modelo, setor_id, empresa_id) VALUES ($1,'modelo teste',$2,$3) RETURNING id`,
      [`${fx.A.marcador}_maquina_destino2`, setorRes.rows[0].id, fx.A.empresaId]
    );
    const destinoId = novaMaquina.rows[0].id;

    const res = await comoA(
      request(app).post(`/maquinas/${destinoId}/planos-manutencao/clonar`).send({
        maquina_origem_id: fx.B.maquinaId,
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("geração automática (cron) a partir dos planos", () => {
  function servico() {
    const planoRepo = new PlanoManutencaoRepository();

    const originalDias = planoRepo.buscarVencidosPorDias.bind(planoRepo);
    vi.spyOn(planoRepo, "buscarVencidosPorDias").mockImplementation(async (data: string) => {
      const todos = await originalDias(data);
      return todos.filter((p: any) => [fx.A.empresaId, fx.B.empresaId].includes(p.empresa_id));
    });

    const originalHoras = planoRepo.buscarVencidosPorHoras.bind(planoRepo);
    vi.spyOn(planoRepo, "buscarVencidosPorHoras").mockImplementation(async () => {
      const todos = await originalHoras();
      return todos.filter((p: any) => [fx.A.empresaId, fx.B.empresaId].includes(p.empresa_id));
    });

    return new ManutencaoPreventivaService(
      new MaquinaRepository(),
      new OrdemServicoRepository(),
      new UsuarioRepository(),
      new NotificacaoSistemaService(new NotificacaoService(), new PushNotificationService()),
      planoRepo
    );
  }

  it("plano por dias vencido gera O.S. amarrada ao plano", async () => {
    const plano = await pool.query(
      `INSERT INTO planos_manutencao_preventiva (maquina_id, empresa_id, descricao, tipo_gatilho, intervalo_dias, proxima_data)
       VALUES ($1,$2,'Vencido hoje','DIAS',30, CURRENT_DATE) RETURNING id`,
      [fx.A.maquinaId, fx.A.empresaId]
    );
    const planoId = plano.rows[0].id;

    await servico().gerarOrdensDosPlanos();

    const os = await pool.query(`SELECT id FROM ordens_servico WHERE plano_manutencao_id = $1`, [planoId]);
    expect(os.rows.length).toBe(1);

    // gestor/técnico da empresa são notificados, igual já acontece no mecanismo legado
    const notifs = await pool.query(`SELECT empresa_id FROM notificacoes WHERE tipo = 'PREVENTIVA' AND url = $1`, [
      `/ordens-servico/${os.rows[0].id}`,
    ]);
    expect(notifs.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifs.rows.every((n) => n.empresa_id === fx.A.empresaId)).toBe(true);
  });

  it("rodar de novo não duplica (plano já tem O.S. pendente)", async () => {
    const plano = await pool.query(
      `SELECT id FROM planos_manutencao_preventiva WHERE maquina_id = $1 AND descricao = 'Vencido hoje'`,
      [fx.A.maquinaId]
    );

    await servico().gerarOrdensDosPlanos();

    const os = await pool.query(`SELECT COUNT(*)::int n FROM ordens_servico WHERE plano_manutencao_id = $1`, [
      plano.rows[0].id,
    ]);
    expect(os.rows[0].n).toBe(1);
  });

  it("dois planos vencidos na mesma máquina geram duas O.S. independentes (um não bloqueia o outro)", async () => {
    const p1 = await pool.query(
      `INSERT INTO planos_manutencao_preventiva (maquina_id, empresa_id, descricao, tipo_gatilho, intervalo_dias, proxima_data)
       VALUES ($1,$2,'Plano Um','DIAS',7, CURRENT_DATE) RETURNING id`,
      [fx.B.maquinaId, fx.B.empresaId]
    );
    const p2 = await pool.query(
      `INSERT INTO planos_manutencao_preventiva (maquina_id, empresa_id, descricao, tipo_gatilho, intervalo_dias, proxima_data)
       VALUES ($1,$2,'Plano Dois','DIAS',14, CURRENT_DATE) RETURNING id`,
      [fx.B.maquinaId, fx.B.empresaId]
    );

    await servico().gerarOrdensDosPlanos();

    const os = await pool.query(`SELECT plano_manutencao_id FROM ordens_servico WHERE plano_manutencao_id = ANY($1::int[])`, [
      [p1.rows[0].id, p2.rows[0].id],
    ]);
    expect(os.rows.length).toBe(2);
  });

  it("plano por horas vencido (horímetro já passou do intervalo) gera O.S.", async () => {
    // fixture grava horas_ligadas = 10; referência 0 + intervalo 5 já venceu
    const plano = await pool.query(
      `INSERT INTO planos_manutencao_preventiva (maquina_id, empresa_id, descricao, tipo_gatilho, intervalo_horas, horas_referencia)
       VALUES ($1,$2,'Plano por horas','HORAS',5,0) RETURNING id`,
      [fx.A.maquinaId, fx.A.empresaId]
    );

    await servico().gerarOrdensDosPlanos();

    const os = await pool.query(`SELECT id FROM ordens_servico WHERE plano_manutencao_id = $1`, [plano.rows[0].id]);
    expect(os.rows.length).toBe(1);
  });
});

describe("finalizar O.S. avança só o plano vinculado", () => {
  it("finalizar avança o plano da O.S., sem afetar outros planos da mesma máquina", async () => {
    const criadoP1 = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Plano A finalizar",
        tipo_gatilho: "DIAS",
        intervalo_dias: 10,
      })
    );
    const criadoP2 = await comoA(
      request(app).post(`/maquinas/${fx.A.maquinaId}/planos-manutencao`).send({
        descricao: "Plano B intacto",
        tipo_gatilho: "DIAS",
        intervalo_dias: 20,
      })
    );
    const p1 = criadoP1.body;
    const p2Antes = criadoP2.body;

    const osRes = await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, empresa_id, plano_manutencao_id)
       VALUES ($1,'teste avanço de plano','EM_ANDAMENTO','PREVENTIVA','MEDIA', NOW(), $2, $3) RETURNING id`,
      [fx.A.maquinaId, fx.A.empresaId, p1.id]
    );
    const osId = osRes.rows[0].id;

    const finalizar = await comoA(request(app).patch(`/ordens-servico/${osId}/finalizar`).send({ resolucao: "feito" }));
    expect(finalizar.status).toBe(200);

    const listaDepois = await comoA(request(app).get(`/maquinas/${fx.A.maquinaId}/planos-manutencao`));
    const atualizado1 = listaDepois.body.find((p: any) => p.id === p1.id);
    const atualizado2 = listaDepois.body.find((p: any) => p.id === p2Antes.id);

    // plano 1 (vinculado à O.S. finalizada) avançou pra hoje + seu próprio intervalo (10 dias) —
    // mesmo motivo do teste acima: compara com o CURRENT_DATE do banco, não com "new Date()" local/UTC
    const { rows: [{ esperado1 }] } = await pool.query<{ esperado1: string }>(
      `SELECT (CURRENT_DATE + 10)::text AS esperado1`
    );
    expect(new Date(atualizado1.proxima_data).toISOString().slice(0, 10)).toBe(esperado1);

    // plano 2 (não vinculado a nenhuma O.S. finalizada) continua intocado
    expect(atualizado2.proxima_data).toBe(p2Antes.proxima_data);
  });
});

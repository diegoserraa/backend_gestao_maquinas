import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Pausa de O.S.: exige motivo, mede o tempo parado (que não conta como tempo de reparo),
 * guarda o histórico e respeita as permissões e o isolamento entre empresas.
 * Também cobre a regra "gestor não assume O.S.".
 */

let fx: Fixture;

const comoAdminA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoGestorA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenGestor}`);
const comoTecnicoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenTecnico}`);
const comoTecnico2A = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenTecnico2}`);
const comoOperadorA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenOperador}`);
const comoAdminB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);

async function novaOS(status = "ABERTA", tecnicoId: number | null = null): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, data_inicio_atendimento,
        id_solicitante, id_tecnico, id_atribuido_por, empresa_id)
     VALUES ($1,$2,$3::varchar,'CORRETIVA','ALTA', NOW(), CASE WHEN $3::varchar = 'EM_ANDAMENTO' THEN NOW() ELSE NULL END, $4, $5, $6, $7)
     RETURNING id`,
    [fx.A.maquinaId, `${fx.A.marcador}_os_pausa`, status, fx.A.adminId, tecnicoId, tecnicoId ? fx.A.gestorId : null, fx.A.empresaId]
  );
  return rows[0].id;
}

/** O.S. do técnico já em andamento (o caso normal para pausar). */
const osEmAndamento = () => novaOS("EM_ANDAMENTO", fx.A.tecnicoId);

const ler = async (id: number) => (await pool.query(`SELECT * FROM ordens_servico WHERE id = $1`, [id])).rows[0];
const pausasDe = async (id: number) => (await pool.query(`SELECT * FROM os_pausas WHERE os_id = $1 ORDER BY id`, [id])).rows;

/** Empurra a pausa em curso para o passado (para medir tempo sem esperar). */
async function envelhecerPausa(osId: number, segundos: number) {
  await pool.query(`UPDATE ordens_servico SET pausada_em = pausada_em - ($2 || ' seconds')::interval WHERE id = $1`, [osId, String(segundos)]);
  await pool.query(`UPDATE os_pausas SET pausada_em = pausada_em - ($2 || ' seconds')::interval WHERE os_id = $1 AND retomada_em IS NULL`, [osId, String(segundos)]);
}

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("pausar", () => {
  it("o técnico responsável pausa com motivo: status, início e motivo ficam na O.S. e o histórico ganha uma linha", async () => {
    const id = await osEmAndamento();
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Aguardando peça" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAUSADA");
    expect(res.body.motivo_pausa).toBe("Aguardando peça");
    expect(res.body.pausada_em).toBeTruthy();

    const pausas = await pausasDe(id);
    expect(pausas).toHaveLength(1);
    expect(pausas[0].motivo).toBe("Aguardando peça");
    expect(pausas[0].retomada_em).toBeNull();
    expect(pausas[0].pausada_por).toBe(fx.A.tecnicoId);
    expect(pausas[0].empresa_id).toBe(fx.A.empresaId);
  });

  it.each([
    ["sem corpo", {}],
    ["motivo vazio", { motivo: "" }],
    ["motivo só com espaços", { motivo: "    " }],
    ["motivo enorme", { motivo: "x".repeat(1001) }],
  ])("%s devolve 400 e nada muda", async (_n, corpo) => {
    const id = await osEmAndamento();
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send(corpo);
    expect(res.status).toBe(400);
    expect((await ler(id)).status).toBe("EM_ANDAMENTO");
    expect(await pausasDe(id)).toHaveLength(0);
  });

  it.each(["ABERTA", "ATRIBUIDA", "FINALIZADA", "CANCELADA"])("não pausa O.S. %s", async (status) => {
    const id = await novaOS(status, fx.A.tecnicoId);
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe(status);
  });

  it("pausar duas vezes seguidas: a segunda é recusada e só existe uma pausa aberta", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "1" });
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "2" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await pausasDe(id)).toHaveLength(1);
  });

  it("dois cliques ao mesmo tempo: só uma pausa é criada", async () => {
    const id = await osEmAndamento();
    const [a, b] = await Promise.all([
      comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "a" }),
      comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "b" }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect(await pausasDe(id)).toHaveLength(1);
  });

  it("outro técnico (que não é o responsável) não pausa a O.S. alheia", async () => {
    const id = await osEmAndamento();
    const res = await comoTecnico2A(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    expect(res.status).toBe(403);
    expect((await ler(id)).status).toBe("EM_ANDAMENTO");
  });

  it("operador (sem a permissão) não pausa", async () => {
    const id = await osEmAndamento();
    const res = await comoOperadorA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    expect(res.status).toBe(403);
  });

  it("gestor NÃO pausa nem retoma (não faz manutenção), mesmo com O.S. de qualquer técnico", async () => {
    const id = await osEmAndamento();
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Parada pela gestão" });
    expect(res.status).toBe(403);
    expect((await ler(id)).status).toBe("EM_ANDAMENTO");

    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    const retomar = await comoGestorA(request(app).patch(`/ordens-servico/${id}/retomar`));
    expect(retomar.status).toBe(403);
    expect((await ler(id)).status).toBe("PAUSADA");
  });

  it("o administrador (dono do sistema) pode pausar", async () => {
    const id = await osEmAndamento();
    const res = await comoAdminA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Suporte" });
    expect(res.status).toBe(200);
  });

  it("quem abriu e quem atribuiu são avisados (menos quem pausou)", async () => {
    const id = await osEmAndamento();
    const antesAdmin = (await pool.query(`SELECT count(*)::int n FROM notificacoes WHERE usuario_id=$1 AND tipo='OS_PAUSADA'`, [fx.A.adminId])).rows[0].n;
    const antesGestor = (await pool.query(`SELECT count(*)::int n FROM notificacoes WHERE usuario_id=$1 AND tipo='OS_PAUSADA'`, [fx.A.gestorId])).rows[0].n;
    const antesTec = (await pool.query(`SELECT count(*)::int n FROM notificacoes WHERE usuario_id=$1 AND tipo='OS_PAUSADA'`, [fx.A.tecnicoId])).rows[0].n;

    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Aviso" });

    const dep = async (u: number) => (await pool.query(`SELECT count(*)::int n FROM notificacoes WHERE usuario_id=$1 AND tipo='OS_PAUSADA'`, [u])).rows[0].n;
    expect(await dep(fx.A.adminId)).toBe(antesAdmin + 1); // solicitante
    expect(await dep(fx.A.gestorId)).toBe(antesGestor + 1); // atribuiu
    expect(await dep(fx.A.tecnicoId)).toBe(antesTec); // quem pausou não é avisado
  });
});

describe("retomar e medir o tempo parado", () => {
  it("retomar soma o tempo parado, volta a EM_ANDAMENTO e fecha a pausa no histórico", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Peça" });
    await envelhecerPausa(id, 600);

    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/retomar`));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("EM_ANDAMENTO");
    expect(res.body.pausada_em).toBeNull();
    expect(res.body.motivo_pausa).toBeNull();
    expect(res.body.tempo_pausado_segundos).toBeGreaterThanOrEqual(600);
    expect(res.body.tempo_pausado_segundos).toBeLessThan(660);

    const pausas = await pausasDe(id);
    expect(pausas[0].retomada_em).not.toBeNull();
    expect(pausas[0].retomada_por).toBe(fx.A.tecnicoId);
  });

  it("várias pausas: os tempos se acumulam e o histórico lista todas em ordem", { timeout: 90_000 }, async () => {
    const id = await osEmAndamento();
    for (const seg of [300, 120]) {
      await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: `pausa de ${seg}s` });
      await envelhecerPausa(id, seg);
      await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/retomar`));
    }

    const os = await ler(id);
    expect(os.tempo_pausado_segundos).toBeGreaterThanOrEqual(420);
    expect(os.tempo_pausado_segundos).toBeLessThan(480);

    const res = await comoAdminA(request(app).get(`/ordens-servico/${id}/pausas`));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((p: any) => p.motivo)).toEqual(["pausa de 300s", "pausa de 120s"]);
    expect(res.body[0].duracao_segundos).toBeGreaterThanOrEqual(300);
    expect(res.body[0].pausada_por_nome).toContain("tecnico");
  });

  it("não retoma O.S. que não está pausada", async () => {
    const id = await osEmAndamento();
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/retomar`));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe("EM_ANDAMENTO");
  });

  it("O.S. pausada não pode ser finalizada antes de retomar", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/finalizar`)).send({ resolucao: "ok" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe("PAUSADA");
  });

  it("depois de retomar, finaliza normalmente e o tempo pausado permanece registrado", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    await envelhecerPausa(id, 200);
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/retomar`));
    const fim = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/finalizar`)).send({ resolucao: "resolvido" });

    expect(fim.status).toBe(200);
    expect(fim.body.status).toBe("FINALIZADA");
    expect(fim.body.tempo_pausado_segundos).toBeGreaterThanOrEqual(200);
  });

  it("cancelar uma O.S. pausada encerra a pausa (tempo registrado, sem pausa aberta)", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "x" });
    await envelhecerPausa(id, 90);

    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/cancelar`)).send({ motivo_cancelamento: "não vale a pena" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELADA");
    expect(res.body.pausada_em).toBeNull();
    expect(res.body.tempo_pausado_segundos).toBeGreaterThanOrEqual(90);

    const pausas = await pausasDe(id);
    expect(pausas[0].retomada_em).not.toBeNull();
  });
});

describe("métricas", () => {
  it("MTTR da máquina desconta o tempo pausado", async () => {
    // máquina só deste teste (as outras O.S. da máquina principal não interferem na média)
    const maq = await pool.query(
      `INSERT INTO maquinas (nome, modelo, fabricante, ano, setor_id, status, empresa_id)
       VALUES ($1,'M','F',2024,$2,'ativa',$3) RETURNING id`,
      [`${fx.A.marcador}_maquina_mttr`, fx.A.setorId, fx.A.empresaId]
    );
    const maquinaId = maq.rows[0].id;

    // O.S. corretiva finalizada: 2h de atendimento, 1h delas pausada => reparo efetivo de 1h
    const { rows } = await pool.query(
      `INSERT INTO ordens_servico
         (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, data_inicio_atendimento,
          data_resolucao, tempo_pausado_segundos, empresa_id)
       VALUES ($1,'mttr','FINALIZADA','CORRETIVA','ALTA',
               '2026-01-01 08:00','2026-01-01 08:30','2026-01-01 10:30', 3600, $2)
       RETURNING id`,
      [maquinaId, fx.A.empresaId]
    );
    expect(rows[0].id).toBeGreaterThan(0);

    const res = await comoAdminA(request(app).get(`/ordens-servico/maquina/${maquinaId}/indicadores`));
    expect(res.status).toBe(200);
    expect(res.body.tempoPausadoSegundos).toBe(3600);
    expect(res.body.osPausadas).toBe(0);
    // a única corretiva finalizada da máquina: MTTR = 2h de atendimento - 1h pausada = 3600s
    expect(Math.round(res.body.mttrSegundos)).toBe(3600);
  });

  it("a O.S. traz a pausa em curso (para o front mostrar o cronômetro)", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "Almoço da equipe" });
    const res = await comoAdminA(request(app).get(`/ordens-servico/${id}`));
    expect(res.body.status).toBe("PAUSADA");
    expect(res.body.motivo_pausa).toBe("Almoço da equipe");
    expect(res.body.pausada_em).toBeTruthy();
  });
});

describe("relatórios com a métrica de pausa", () => {
  it("histórico de O.S.: traz o tempo pausado de cada O.S.", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "relatório" });
    await envelhecerPausa(id, 300);
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/retomar`));

    const res = await comoAdminA(request(app).get("/relatorios/ordens-servico/preview"));
    expect(res.status).toBe(200);
    const linha = res.body.find((o: any) => o.id === id);
    expect(linha).toBeDefined();
    expect(Number(linha.tempo_pausado_segundos)).toBeGreaterThanOrEqual(300);
  });

  it("indicadores por máquina: contam as O.S. pausadas (não somem entre as colunas)", async () => {
    const maq = await pool.query(
      `INSERT INTO maquinas (nome, modelo, fabricante, ano, setor_id, status, empresa_id)
       VALUES ($1,'M','F',2024,$2,'ativa',$3) RETURNING id`,
      [`${fx.A.marcador}_maquina_rel`, fx.A.setorId, fx.A.empresaId]
    );
    const maquinaId = maq.rows[0].id;
    await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, data_inicio_atendimento, pausada_em, motivo_pausa, empresa_id)
       VALUES ($1,'pausada','PAUSADA','CORRETIVA','ALTA',NOW(),NOW(),NOW(),'x',$2)`,
      [maquinaId, fx.A.empresaId]
    );

    const res = await comoAdminA(request(app).get("/relatorios/manutencao/preview"));
    expect(res.status).toBe(200);
    const linha = res.body.find((m: any) => m.maquina_nome === `${fx.A.marcador}_maquina_rel`);
    expect(linha).toBeDefined();
    expect(Number(linha.total_os)).toBe(1);
    expect(Number(linha.os_pausadas)).toBe(1);
    expect(Number(linha.os_em_andamento)).toBe(0);
  });

  it("os arquivos Excel dos dois relatórios continuam sendo gerados", async () => {
    const os = await comoAdminA(request(app).get("/relatorios/ordens-servico"));
    const man = await comoAdminA(request(app).get("/relatorios/manutencao"));
    expect(os.status).toBe(200);
    expect(man.status).toBe(200);
    expect(String(os.headers["content-type"])).toContain("spreadsheet");
    expect(String(man.headers["content-type"])).toContain("spreadsheet");
  });
});

describe("nome do solicitante", () => {
  it("a O.S. traz o nome real de quem abriu (nada de valor fixo na tela)", async () => {
    const id = await osEmAndamento();
    const res = await comoAdminA(request(app).get(`/ordens-servico/${id}`));
    expect(res.status).toBe(200);
    expect(res.body.solicitante_nome).toBe(`${fx.A.marcador}_admin`);
  });

  it("O.S. sem solicitante devolve nulo, sem quebrar", async () => {
    const { rows } = await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, empresa_id)
       VALUES ($1,'sem solicitante','ABERTA','CORRETIVA','BAIXA',NOW(),$2) RETURNING id`,
      [fx.A.maquinaId, fx.A.empresaId]
    );
    const res = await comoAdminA(request(app).get(`/ordens-servico/${rows[0].id}`));
    expect(res.body.solicitante_nome).toBeNull();
  });

  it("não vaza o nome quando o solicitante é de outra empresa", async () => {
    const { rows } = await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_solicitante, empresa_id)
       VALUES ($1,'solicitante alheio','ABERTA','CORRETIVA','BAIXA',NOW(),$2,$3) RETURNING id`,
      [fx.A.maquinaId, fx.B.adminId, fx.A.empresaId]
    );
    const res = await comoAdminA(request(app).get(`/ordens-servico/${rows[0].id}`));
    expect(res.body.solicitante_nome).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(fx.B.marcador);
  });
});

describe("isolamento entre empresas", () => {
  it("empresa B não pausa, retoma nem lê o histórico da O.S. da empresa A", async () => {
    const id = await osEmAndamento();
    await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "segredo-da-A" });

    const pausar = await comoAdminB(request(app).patch(`/ordens-servico/${id}/pausar`)).send({ motivo: "invasão" });
    const retomar = await comoAdminB(request(app).patch(`/ordens-servico/${id}/retomar`));
    const hist = await comoAdminB(request(app).get(`/ordens-servico/${id}/pausas`));

    expect(pausar.status).toBeGreaterThanOrEqual(400);
    expect(retomar.status).toBeGreaterThanOrEqual(400);
    expect(hist.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(hist.body)).not.toContain("segredo-da-A");

    const os = await ler(id);
    expect(os.status).toBe("PAUSADA");
    expect(os.motivo_pausa).toBe("segredo-da-A");
  });
});

describe("permissão 'Pausar e retomar'", () => {
  it("técnico padrão pode pausar; operador padrão não", async () => {
    const t = await request(app).get("/permissoes/eu").set("Authorization", `Bearer ${fx.A.tokenTecnico}`);
    const o = await request(app).get("/permissoes/eu").set("Authorization", `Bearer ${fx.A.tokenOperador}`);
    expect(JSON.stringify(t.body)).toContain("os.pausar");
    expect(JSON.stringify(o.body)).not.toContain("os.pausar");
  });

  it("técnico sem 'os.pausar' recebe 403", async () => {
    const semPerm = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.iniciar"] });
    const { rows } = await pool.query(
      `INSERT INTO ordens_servico (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_tecnico, empresa_id)
       VALUES ($1,'sem perm','EM_ANDAMENTO','CORRETIVA','ALTA',NOW(),$2,$3) RETURNING id`,
      [fx.A.maquinaId, semPerm.id, fx.A.empresaId]
    );
    const res = await request(app).patch(`/ordens-servico/${rows[0].id}/pausar`).set("Authorization", `Bearer ${semPerm.token}`).send({ motivo: "x" });
    expect(res.status).toBe(403);
  });

  it("aparece no catálogo", async () => {
    const res = await comoAdminA(request(app).get("/permissoes/catalogo"));
    const os = res.body.modulos.find((m: any) => m.chave === "os");
    expect(os.acoes.map((a: any) => a.permissao)).toContain("os.pausar");
  });
});

describe("gestor não faz manutenção: atribui, cancela e só finaliza O.S. de técnico externo", () => {
  it("gestor não inicia atendimento", async () => {
    const id = await novaOS("ATRIBUIDA", fx.A.tecnicoId);
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/iniciar`));
    expect(res.status).toBe(403);
    expect((await ler(id)).status).toBe("ATRIBUIDA");
  });

  it("gestor NÃO finaliza a O.S. de um técnico da empresa", async () => {
    const id = await osEmAndamento();
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/finalizar`)).send({ resolucao: "tentativa" });
    expect(res.status).toBe(403);
    expect((await ler(id)).status).toBe("EM_ANDAMENTO");
  });

  it("gestor define técnico externo: a O.S. já fica em andamento (sem 'iniciar') e ele finaliza com parceiro e custo", async () => {
    const id = await novaOS("ABERTA");
    const def = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ externo: true });
    expect(def.status).toBe(200);
    expect(def.body.execucao_externa).toBe(true);
    expect(def.body.status).toBe("EM_ANDAMENTO");
    expect(def.body.data_inicio_atendimento).toBeTruthy();
    expect(def.body.id_tecnico).toBeNull();

    const fim = await comoGestorA(request(app).patch(`/ordens-servico/${id}/finalizar`)).send({
      resolucao: "Parceiro concluiu o reparo",
      id_parceiro: fx.A.parceiroId,
      valor_parceiro: 350,
    });
    expect(fim.status).toBe(200);
    expect(fim.body.status).toBe("FINALIZADA");
  });

  it("técnico com 'agir em O.S. de outros' também pode finalizar a externa", async () => {
    const coord = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.finalizar", "os.agir_em_qualquer"] });
    const id = await novaOS("ABERTA");
    await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ externo: true });
    const res = await request(app).patch(`/ordens-servico/${id}/finalizar`).set("Authorization", `Bearer ${coord.token}`).send({
      resolucao: "ok",
      id_parceiro: fx.A.parceiroId,
      valor_parceiro: 10,
    });
    expect(res.status).toBe(200);
  });

  it("gestor cancela (inclusive O.S. pausada) e atribui a técnico", async () => {
    const id = await novaOS("ABERTA");
    const a = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: fx.A.tecnicoId });
    expect(a.status).toBe(200);
    const c = await comoGestorA(request(app).patch(`/ordens-servico/${id}/cancelar`)).send({ motivo_cancelamento: "não é mais necessário" });
    expect(c.status).toBe(200);
  });

  it("o gestor padrão não tem assumir/iniciar/pausar, mas tem atribuir, cancelar, finalizar e definir externo", async () => {
    const g = await request(app).get("/permissoes/eu").set("Authorization", `Bearer ${fx.A.tokenGestor}`);
    const perms: string[] = g.body.permissoes ?? g.body;
    const txt = JSON.stringify(g.body);
    for (const negada of ["os.assumir", "os.iniciar", "os.pausar"]) expect(txt).not.toContain(negada);
    for (const ok of ["os.atribuir", "os.cancelar", "os.finalizar", "os.definir_externo"]) expect(txt).toContain(ok);
    expect(perms).toBeTruthy();
  });

  it("mesmo que alguém dê 'assumir/iniciar/pausar' ao gestor, as permissões são descartadas", async () => {
    const res = await comoAdminA(request(app).get(`/permissoes/usuarios/${fx.A.gestorId}`));
    const permissoes: string[] = res.body.permissoes;
    const put = await comoAdminA(request(app).put(`/permissoes/usuarios/${fx.A.gestorId}`)).send({
      permissoes: [...permissoes, "os.assumir", "os.iniciar", "os.pausar"],
    });
    expect(put.status).toBe(200);
    for (const p of ["os.assumir", "os.iniciar", "os.pausar"]) expect(put.body.permissoes).not.toContain(p);
    const gravadas = (await pool.query(`SELECT permissao FROM usuario_permissoes WHERE usuario_id=$1`, [fx.A.gestorId])).rows.map((r) => r.permissao);
    for (const p of ["os.assumir", "os.iniciar", "os.pausar"]) expect(gravadas).not.toContain(p);
  });

  it("gestor tentando se atribuir a O.S. recebe 403 e nada muda", async () => {
    const id = await novaOS("ABERTA");
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: fx.A.gestorId });
    expect(res.status).toBe(403);
    expect((await ler(id)).status).toBe("ABERTA");
  });

  it("gestor atribui a um técnico: funciona", async () => {
    const id = await novaOS("ABERTA");
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: fx.A.tecnicoId });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ATRIBUIDA");
    expect(res.body.id_tecnico).toBe(fx.A.tecnicoId);
  });

  it.each([
    ["outro gestor", () => fx.A.gestorId],
    ["operador", () => fx.A.operadorId],
    ["administrador", () => fx.A.adminId],
  ])("não se atribui a %s (só a técnico)", async (_n, alvo) => {
    const id = await novaOS("ABERTA");
    const res = await comoAdminA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: alvo() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe("ABERTA");
  });

  it("não atribui a técnico inativo", async () => {
    const inativo = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver"], ativo: false });
    const id = await novaOS("ABERTA");
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: inativo.id });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe("ABERTA");
  });

  it("não atribui a técnico de outra empresa", async () => {
    const id = await novaOS("ABERTA");
    const res = await comoGestorA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: fx.B.tecnicoId });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await ler(id)).status).toBe("ABERTA");
  });

  it("técnico assume para si: continua funcionando", async () => {
    const id = await novaOS("ABERTA");
    const res = await comoTecnicoA(request(app).patch(`/ordens-servico/${id}/atribuir`)).send({ id_tecnico: fx.A.tecnicoId });
    expect(res.status).toBe(200);
    expect(res.body.id_tecnico).toBe(fx.A.tecnicoId);
  });

  it("grupo de gestores: dar 'assumir/iniciar/pausar' não altera ninguém", async () => {
    const res = await comoAdminA(request(app).post("/permissoes/em-grupo")).send({
      acao: "dar",
      permissoes: ["os.assumir", "os.iniciar", "os.pausar"],
      alvo: { tipo: "GESTOR" },
      simular: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.alterados).toHaveLength(0);
  });

  it("catálogo informa o que é vedado ao gestor (a tela esconde essas opções)", async () => {
    const res = await comoAdminA(request(app).get("/permissoes/catalogo"));
    expect(res.body.vedadas.GESTOR).toEqual(expect.arrayContaining(["os.assumir", "os.iniciar", "os.pausar"]));
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { TelemetriaService } from "../src/services/TelemetriaService";
import { MonitoramentoService } from "../src/services/MonitoramentoService";
import { ManutencaoPreventivaService } from "../src/services/ManutencaoPreventivaService";
import { NotificacaoSistemaService } from "../src/services/notificacaoSistemaService";
import { NotificacaoService } from "../src/services/NotificacaoService";
import { PushNotificationService } from "../src/services/PushNotificationService";
import { MonitoramentoRepository } from "../src/repositories/MonitoramentoRepository";
import { MaquinaRepository } from "../src/repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../src/repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../src/repositories/UsuarioRepository";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Fluxos que rodam SEM token (MQTT, cron): é aqui que um erro de empresa
 * passaria em silêncio, porque nenhuma checagem de login protege esses caminhos.
 *
 * As varreduras globais (sem sinal, preventiva) são limitadas às empresas de
 * teste via spy — assim nunca encostam nos dados reais do banco.
 */

let fx: Fixture;
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function aguardar<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await fn();
    if (v) return v as T;
    await esperar(200);
  }
  throw new Error("timeout aguardando condição");
}

beforeAll(async () => {
  fx = await criarFixture();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("ingestão de telemetria (MQTT)", () => {
  it("leitura de máquina da A fica gravada na empresa A", async () => {
    const svc = new TelemetriaService();
    const leitura = await svc.registrarLeitura(fx.A.maquinaId, { temperatura: 42, vibracao: 1.5 });

    expect(leitura).not.toBeNull();
    expect(leitura!.empresa_id).toBe(fx.A.empresaId);

    const { rows } = await pool.query(
      `SELECT empresa_id FROM telemetria_leituras WHERE maquina_id = $1 ORDER BY id DESC LIMIT 1`,
      [fx.A.maquinaId]
    );
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);

    const atual = await pool.query(`SELECT empresa_id FROM telemetria_atual WHERE maquina_id = $1`, [
      fx.A.maquinaId,
    ]);
    expect(atual.rows[0].empresa_id).toBe(fx.A.empresaId);
  });

  it("máquina inexistente é ignorada sem gravar nada", async () => {
    const svc = new TelemetriaService();
    const antes = await pool.query(`SELECT COUNT(*)::int n FROM telemetria_leituras WHERE maquina_id = 2147483000`);
    const r = await svc.registrarLeitura(2147483000, { temperatura: 1 });
    expect(r).toBeNull();
    expect(antes.rows[0].n).toBe(0);
  });
});

describe("motor de alertas (disparado pela telemetria)", () => {
  it("alerta, O.S. automática e notificações ficam só na empresa da máquina", async () => {
    // janela 0 = alerta confirma já na primeira leitura fora do limite
    await pool.query(
      `INSERT INTO maquina_parametros
         (maquina_id, chave, unidade, minimo, atencao, alarme, janela_seg, abrir_os_auto, ativo, empresa_id)
       VALUES ($1,'temperatura','C',NULL,60,80,0,true,true,$2)`,
      [fx.A.maquinaId, fx.A.empresaId]
    );

    const svc = new TelemetriaService();
    await svc.registrarLeitura(fx.A.maquinaId, { temperatura: 95 });

    const alerta = await aguardar(async () => {
      const { rows } = await pool.query(
        `SELECT * FROM telemetria_alertas WHERE maquina_id = $1 AND chave = 'temperatura'`,
        [fx.A.maquinaId]
      );
      return rows[0];
    });
    expect(alerta.empresa_id).toBe(fx.A.empresaId);

    // O.S. automática, na empresa certa
    const os = await aguardar(async () => {
      const { rows } = await pool.query(
        `SELECT * FROM ordens_servico WHERE maquina_id = $1 AND descricao LIKE 'Alerta de monitoramento%'`,
        [fx.A.maquinaId]
      );
      return rows[0];
    });
    expect(os.empresa_id).toBe(fx.A.empresaId);

    // notificação do alerta chegou no técnico da A e em ninguém da B
    const notifA = await aguardar(async () => {
      const { rows } = await pool.query(
        `SELECT * FROM notificacoes WHERE usuario_id = $1 AND tipo = 'MONITORAMENTO_ALERTA'`,
        [fx.A.tecnicoId]
      );
      return rows[0];
    });
    expect(notifA.empresa_id).toBe(fx.A.empresaId);

    const vazou = await pool.query(
      `SELECT COUNT(*)::int n FROM notificacoes WHERE empresa_id = $1 AND tipo IN ('MONITORAMENTO_ALERTA','OS_CRIADA')`,
      [fx.B.empresaId]
    );
    expect(vazou.rows[0].n).toBe(0);

    const alertasB = await pool.query(`SELECT COUNT(*)::int n FROM telemetria_alertas WHERE empresa_id = $1`, [
      fx.B.empresaId,
    ]);
    expect(alertasB.rows[0].n).toBe(0);
    const osB = await pool.query(
      `SELECT COUNT(*)::int n FROM ordens_servico WHERE empresa_id = $1 AND descricao LIKE 'Alerta%'`,
      [fx.B.empresaId]
    );
    expect(osB.rows[0].n).toBe(0);
  });

  it("B não vê nem mexe no alerta da A pela API", async () => {
    const { rows } = await pool.query(`SELECT id FROM telemetria_alertas WHERE empresa_id = $1 LIMIT 1`, [
      fx.A.empresaId,
    ]);
    const alertaId = rows[0].id;

    const lista = await comoB(request(app).get("/monitoramento/alertas?status=todos"));
    expect(JSON.stringify(lista.body)).not.toContain(fx.A.marcador);

    await comoB(request(app).patch(`/monitoramento/alertas/${alertaId}/resolver`));
    const depois = await pool.query(`SELECT resolvido_em FROM telemetria_alertas WHERE id = $1`, [alertaId]);
    expect(depois.rows[0].resolvido_em).toBeNull();

    const abrir = await comoB(request(app).post(`/monitoramento/alertas/${alertaId}/abrir-os`)).send({});
    expect(abrir.status).not.toBe(201);
  });

  it("B não altera nem remove os parâmetros de monitoramento da máquina da A", async () => {
    await comoB(request(app).put(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros`)).send([
      { chave: "temperatura", unidade: "C", minimo: null, atencao: 1, alarme: 2, janela_seg: 5, abrir_os_auto: false, ativo: false },
    ]);
    await comoB(request(app).delete(`/monitoramento/maquinas/${fx.A.maquinaId}/parametros/temperatura`));

    const { rows } = await pool.query(
      `SELECT atencao, alarme, ativo, empresa_id FROM maquina_parametros WHERE maquina_id = $1 AND chave = 'temperatura'`,
      [fx.A.maquinaId]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].atencao)).toBe(60);
    expect(Number(rows[0].alarme)).toBe(80);
    expect(rows[0].ativo).toBe(true);
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);
  });
});

describe("varredura de máquinas sem sinal (cron)", () => {
  it("alerta 'sem sinal' só na empresa da máquina parada", async () => {
    // A: última leitura há 10 min. B: leitura de agora.
    await pool.query(
      `UPDATE telemetria_atual SET atualizado_em = now() - interval '10 minutes' WHERE maquina_id = $1`,
      [fx.A.maquinaId]
    );
    await pool.query(`UPDATE telemetria_atual SET atualizado_em = now() WHERE maquina_id = $1`, [fx.B.maquinaId]);

    // varredura global, mas só enxerga as empresas de teste
    const original = MonitoramentoRepository.prototype.maquinasSemSinal;
    vi.spyOn(MonitoramentoRepository.prototype, "maquinasSemSinal").mockImplementation(async function (
      this: MonitoramentoRepository,
      minutos: number
    ) {
      const todas = await original.call(this, minutos);
      return todas.filter((m) => [fx.A.empresaId, fx.B.empresaId].includes(m.empresa_id));
    });

    await new MonitoramentoService().varrerSemSinal(5);

    const a = await pool.query(
      `SELECT empresa_id FROM telemetria_alertas WHERE maquina_id = $1 AND chave = 'sinal'`,
      [fx.A.maquinaId]
    );
    expect(a.rows.length).toBeGreaterThanOrEqual(1);
    expect(a.rows[0].empresa_id).toBe(fx.A.empresaId);

    const b = await pool.query(`SELECT COUNT(*)::int n FROM telemetria_alertas WHERE maquina_id = $1`, [
      fx.B.maquinaId,
    ]);
    expect(b.rows[0].n).toBe(0);

    const notifA = await pool.query(
      `SELECT empresa_id FROM notificacoes WHERE usuario_id = $1 AND tipo = 'MONITORAMENTO_SEM_SINAL'`,
      [fx.A.tecnicoId]
    );
    expect(notifA.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifA.rows[0].empresa_id).toBe(fx.A.empresaId);

    const notifB = await pool.query(
      `SELECT COUNT(*)::int n FROM notificacoes WHERE empresa_id = $1 AND tipo = 'MONITORAMENTO_SEM_SINAL'`,
      [fx.B.empresaId]
    );
    expect(notifB.rows[0].n).toBe(0);
  });
});

describe("job de manutenção preventiva (cron)", () => {
  function servico() {
    const maquinaRepo = new MaquinaRepository();
    const original = maquinaRepo.buscarPorDataProximaManutencao.bind(maquinaRepo);
    vi.spyOn(maquinaRepo, "buscarPorDataProximaManutencao").mockImplementation(async (data: string) => {
      const todas = await original(data);
      return todas.filter((m: any) => [fx.A.empresaId, fx.B.empresaId].includes(m.empresa_id));
    });

    return new ManutencaoPreventivaService(
      maquinaRepo,
      new OrdemServicoRepository(),
      new UsuarioRepository(),
      new NotificacaoSistemaService(new NotificacaoService(), new PushNotificationService())
    );
  }

  it("cada empresa recebe a sua O.S. preventiva e a notificação só dela", async () => {
    const hoje = new Date().toISOString().split("T")[0];
    await pool.query(`UPDATE maquinas SET proxima_manutencao = $1 WHERE id = ANY($2::int[])`, [
      hoje,
      [fx.A.maquinaId, fx.B.maquinaId],
    ]);

    await servico().gerarOrdensPreventivas();

    for (const lado of [fx.A, fx.B]) {
      const os = await pool.query(
        `SELECT id, empresa_id FROM ordens_servico WHERE maquina_id = $1 AND tipo_manutencao = 'PREVENTIVA'`,
        [lado.maquinaId]
      );
      expect(os.rows.length).toBe(1);
      expect(os.rows[0].empresa_id).toBe(lado.empresaId);

      // a notificação dessa O.S. só existe dentro da própria empresa
      const notifs = await pool.query(
        `SELECT DISTINCT empresa_id FROM notificacoes WHERE tipo = 'PREVENTIVA' AND url = $1`,
        [`/ordens-servico/${os.rows[0].id}`]
      );
      expect(notifs.rows.length).toBeGreaterThanOrEqual(1);
      expect(notifs.rows.every((n) => n.empresa_id === lado.empresaId)).toBe(true);
    }
  });

  it("rodar de novo não duplica a O.S. preventiva pendente", async () => {
    await servico().gerarOrdensPreventivas();

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int n FROM ordens_servico WHERE maquina_id = ANY($1::int[]) AND tipo_manutencao = 'PREVENTIVA'`,
      [[fx.A.maquinaId, fx.B.maquinaId]]
    );
    expect(rows[0].n).toBe(2);
  });
});

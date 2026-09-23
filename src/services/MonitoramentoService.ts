import { MonitoramentoRepository } from "../repositories/MonitoramentoRepository";
import { NotificacaoRepository } from "../repositories/NotificacaoRepository";
import { OrdemServicoService } from "./OrdemServicoService";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { NotificacaoService } from "./NotificacaoService";
import { PushNotificationService } from "./PushNotificationService";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { broadcastEvento } from "../realtime/wsBus";
import { logger } from "../config/logger";
import {
    IAlertaEstado,
    IMaquinaParametro,
    NivelAlerta,
} from "../interfaces/Imonitoramento";

const log = logger.child({ modulo: "monitoramento" });

const CACHE_PARAMS_MS = 30_000;

type LeituraMetricas = {
    temperatura: number | null;
    vibracao: number | null;
    horas_ligadas: number | null;
};

export class MonitoramentoService {

    private repo = new MonitoramentoRepository();
    private notifRepo = new NotificacaoRepository();
    private osService = new OrdemServicoService(
        new OrdemServicoRepository(),
        new UsuarioRepository(),
        new NotificacaoSistemaService(new NotificacaoService(), new PushNotificationService()),
        new MaquinaRepository()
    );

    private cacheParams = new Map<number, { exp: number; lista: IMaquinaParametro[] }>();

    // fila por máquina: evita corrida entre leituras quase simultâneas
    private filas = new Map<number, Promise<unknown>>();

    /* ============ PARÂMETROS (CRUD) ============ */

    listarParametros(maquinaId: number, empresaId: string) {
        return this.repo.listarParametros(maquinaId, empresaId);
    }

    async salvarParametros(maquinaId: number, lista: IMaquinaParametro[], empresaId: string) {
        // a máquina precisa ser da empresa de quem chama — senão o upsert
        // (que casa por maquina_id + chave) reescreveria limites de outra empresa
        if ((await this.repo.empresaDaMaquina(maquinaId)) !== empresaId) {
            throw new Error("Máquina não encontrada");
        }

        const salvos: IMaquinaParametro[] = [];
        for (const p of lista) {
            salvos.push(await this.repo.upsertParametro({
                ...p,
                maquina_id: maquinaId,
                janela_seg: Number(p.janela_seg) > 0 ? Number(p.janela_seg) : 120,
                abrir_os_auto: !!p.abrir_os_auto,
                ativo: p.ativo !== false,
            }, empresaId));
        }
        this.cacheParams.delete(maquinaId);
        return salvos;
    }

    removerParametro(maquinaId: number, chave: string, empresaId: string) {
        this.cacheParams.delete(maquinaId);
        return this.repo.removerParametro(maquinaId, chave, empresaId);
    }

    /* ============ ALERTAS (API) ============ */

    listarAlertas(status: string | null, empresaId: string) {
        return this.repo.listarAlertas(status, empresaId);
    }

    listarPendentes(empresaId: string) {
        return this.repo.listarPendentes(empresaId);
    }

    async resolverAlertaManual(id: number, empresaId: string) {
        // busca já escopada pela empresa: garante que ninguém resolve
        // alerta de outra empresa só adivinhando o id numérico
        const alerta = await this.repo.buscarAlerta(id, empresaId);
        if (!alerta) throw new Error("Alerta não encontrado");

        await this.repo.resolverAlerta(id);
        // zera o estado para a métrica poder disparar de novo se sair/voltar do limite
        await this.repo.salvarEstado({
            maquina_id: alerta.maquina_id,
            chave: alerta.chave,
            nivel: "normal",
            fora_desde: null,
            valor_pico: null,
            alerta_id: null,
        });
        broadcastEvento("alerta", { acao: "resolvido", id }, empresaId);
    }

    /** Cria uma O.S. a partir do alerta (pré-preenchida) e vincula. */
    async abrirOSDoAlerta(alertaId: number, empresaId: string, solicitanteId?: number) {
        const alerta = await this.repo.buscarAlerta(alertaId, empresaId);
        if (!alerta) throw new Error("Alerta não encontrado");
        if (alerta.status === "convertido") throw new Error("Alerta já virou O.S.");

        const nomeMaquina = await this.repo.nomeMaquina(alerta.maquina_id);
        const descricao =
            alerta.chave === "sinal"
                ? `Máquina ${nomeMaquina} está sem comunicação (sensor/ESP32) — ` +
                  `verificar dispositivo, rede WiFi e alimentação.`
                : `Alerta de monitoramento — ${alerta.chave.toUpperCase()} ` +
                  `${alerta.valor ?? "?"} (limite ${alerta.limite ?? "?"}) na máquina ${nomeMaquina}.`;

        const os: any = await this.osService.criar({
            maquina_id: alerta.maquina_id,
            descricao,
            status: "ABERTA",
            tipo_manutencao: "CORRETIVA",
            prioridade: alerta.nivel === "critico" ? "ALTA" : "MEDIA",
            id_solicitante: solicitanteId,
        } as any, empresaId);

        const ordemId = os?.id ?? os?.ordem?.id;
        if (ordemId) await this.repo.vincularOrdemServico(alertaId, ordemId);

        broadcastEvento("alerta", { acao: "convertido", id: alertaId, ordem_servico_id: ordemId }, empresaId);
        return { alerta_id: alertaId, ordem_servico_id: ordemId };
    }

    /* ============ MOTOR DE AVALIAÇÃO (ingest) ============ */

    /** Chamado pelo TelemetriaService após gravar cada leitura. (serializado por máquina) */
    async avaliarLeitura(maquinaId: number, m: LeituraMetricas): Promise<void> {
        const anterior = this.filas.get(maquinaId) ?? Promise.resolve();
        const atual = anterior
            .catch(() => { })
            .then(() => this.avaliarLeituraInterno(maquinaId, m));
        this.filas.set(maquinaId, atual);
        return atual;
    }

    private async avaliarLeituraInterno(maquinaId: number, m: LeituraMetricas): Promise<void> {
        // dado voltou a chegar -> resolve "sem sinal"
        await this.repo.resolverAlertasSemSinal(maquinaId).catch(() => { });

        const empresaId = await this.repo.empresaDaMaquina(maquinaId);
        if (!empresaId) return; // máquina não existe (não deveria chegar aqui)

        const params = await this.paramsComCache(maquinaId, empresaId);
        for (const p of params) {
            if (!p.ativo || p.atencao === null) continue;
            const valor = this.valorDaMetrica(p.chave, m);
            if (valor === null) continue;
            await this.avaliarMetrica(maquinaId, p, valor, empresaId).catch((e) =>
                log.error({ err: e, maquinaId, chave: p.chave, empresaId }, "falha ao avaliar métrica")
            );
        }
    }

    private async avaliarMetrica(maquinaId: number, p: IMaquinaParametro, valor: number, empresaId: string) {
        const aten = p.atencao!;
        const alarme = p.alarme ?? aten;
        const margemSaida = Math.max((alarme - aten) * 0.15, 0.1);

        // nível instantâneo
        let instant: NivelAlerta = "normal";
        if (valor >= alarme) instant = "critico";
        else if (valor >= aten) instant = "atencao";
        else if (p.minimo !== null && valor < p.minimo) instant = "atencao";

        const estado: IAlertaEstado = (await this.repo.buscarEstado(maquinaId, p.chave)) ?? {
            maquina_id: maquinaId, chave: p.chave, nivel: "normal",
            fora_desde: null, valor_pico: null, alerta_id: null,
        };

        const agora = new Date();

        if (instant !== "normal") {
            // continua/entra fora do limite
            if (!estado.fora_desde) {
                estado.fora_desde = agora;
                estado.valor_pico = valor;
            } else {
                estado.valor_pico = Math.max(estado.valor_pico ?? valor, valor);
            }
            estado.nivel = this.pior(estado.nivel, instant);

            const segFora = (agora.getTime() - estado.fora_desde.getTime()) / 1000;

            if (!estado.alerta_id && segFora >= p.janela_seg) {
                // >>> confirma: cria o ALERTA
                const limite = estado.nivel === "critico" ? alarme : aten;
                const alerta = await this.repo.criarAlerta({
                    maquina_id: maquinaId,
                    chave: p.chave,
                    nivel: estado.nivel,
                    valor: estado.valor_pico ?? valor,
                    limite,
                    status: "aberto",
                    ordem_servico_id: null,
                    detalhe:
                        `${p.chave} ficou ${Math.round(segFora)}s acima de ${limite}${p.unidade ? " " + p.unidade : ""}` +
                        ` (pico ${estado.valor_pico ?? valor}).`,
                });
                estado.alerta_id = alerta.id ?? null;

                await this.notificar(maquinaId, p, estado.nivel, estado.valor_pico ?? valor, limite, empresaId);
                broadcastEvento("alerta", { acao: "aberto", alerta }, empresaId);

                if (p.abrir_os_auto && alerta.id) {
                    await this.abrirOSDoAlerta(alerta.id, empresaId).catch((e) =>
                        log.error({ err: e, alertaId: alerta.id, empresaId }, "abrir O.S. automática falhou")
                    );
                }
            } else if (estado.alerta_id) {
                // já tem alerta aberto — escalona atenção -> crítico
                await this.repo.atualizarNivelAlerta(estado.alerta_id, estado.nivel, valor);
            }
        } else {
            // instantâneo voltou ao normal
            if (estado.alerta_id) {
                // alerta já confirmado: só resolve com histerese (evita ficar piscando)
                if (valor < aten - margemSaida) {
                    await this.repo.resolverAlerta(estado.alerta_id);
                    broadcastEvento("alerta", { acao: "resolvido", id: estado.alerta_id }, empresaId);
                    estado.nivel = "normal";
                    estado.fora_desde = null;
                    estado.valor_pico = null;
                    estado.alerta_id = null;
                }
            } else if (estado.fora_desde) {
                // ainda em observação (sem alerta): a excursão quebrou -> zera o contador
                estado.nivel = "normal";
                estado.fora_desde = null;
                estado.valor_pico = null;
                broadcastEvento("alerta", {
                    acao: "observacao_encerrada",
                    maquina_id: maquinaId,
                    chave: p.chave,
                }, empresaId);
            }
        }

        await this.repo.salvarEstado(estado);
    }

    /* ============ SEM SINAL (cron) ============ */

    async varrerSemSinal(minutos = 5): Promise<void> {
        // varredura global de propósito (todas as empresas) — cada `p`
        // já carrega seu próprio empresa_id
        const paradas = await this.repo.maquinasSemSinal(minutos);
        for (const p of paradas) {
            const alerta = await this.repo.criarAlerta({
                maquina_id: p.maquina_id,
                chave: "sinal",
                nivel: "sem_sinal",
                valor: null,
                limite: null,
                status: "aberto",
                ordem_servico_id: null,
                detalhe: `Sem telemetria há mais de ${minutos} min.`,
            });
            await this.notificarTexto(
                "Máquina sem sinal",
                `A máquina ${p.nome} parou de enviar telemetria.`,
                "MONITORAMENTO_SEM_SINAL",
                p.empresa_id
            );
            broadcastEvento("alerta", { acao: "aberto", alerta }, p.empresa_id);
        }
    }

    /* ============ helpers ============ */

    private async paramsComCache(maquinaId: number, empresaId: string): Promise<IMaquinaParametro[]> {
        const c = this.cacheParams.get(maquinaId);
        if (c && c.exp > Date.now()) return c.lista;
        const lista = await this.repo.listarParametros(maquinaId, empresaId);
        this.cacheParams.set(maquinaId, { exp: Date.now() + CACHE_PARAMS_MS, lista });
        return lista;
    }

    private valorDaMetrica(chave: string, m: LeituraMetricas): number | null {
        if (chave === "temperatura") return m.temperatura;
        if (chave === "vibracao") return m.vibracao;
        if (chave === "horas_ligadas") return m.horas_ligadas;
        return null;
    }

    private pior(a: NivelAlerta, b: NivelAlerta): NivelAlerta {
        const ordem: NivelAlerta[] = ["normal", "atencao", "critico"];
        return ordem.indexOf(a) >= ordem.indexOf(b) ? a : b;
    }

    private async notificar(
        maquinaId: number, p: IMaquinaParametro, nivel: NivelAlerta, valor: number, limite: number, empresaId: string
    ) {
        const nome = await this.repo.nomeMaquina(maquinaId);
        const titulo = nivel === "critico" ? "Alerta CRÍTICO de monitoramento" : "Alerta de monitoramento";
        const msg =
            `${nome}: ${p.chave} em ${valor}${p.unidade ? " " + p.unidade : ""} ` +
            `(limite ${limite}). Abra a tela de Monitoramento.`;
        await this.notificarTexto(titulo, msg, "MONITORAMENTO_ALERTA", empresaId);
    }

    private async notificarTexto(titulo: string, mensagem: string, tipo: string, empresaId: string) {
        try {
            const { gestores, tecnicos } = await this.repo.idsGestoresETecnicos(empresaId);
            for (const uid of [...gestores, ...tecnicos]) {
                await this.notifRepo.criar({
                    usuario_id: uid, titulo, mensagem, tipo, url: "/monitoring",
                });
            }
        } catch (e: any) {
            log.error({ err: e, empresaId, tipo }, "falha ao notificar usuários");
        }
    }
}

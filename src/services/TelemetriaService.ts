import {
    ITelemetriaAtualComMaquina,
    ITelemetriaLeitura,
} from "../interfaces/Itelemetria";
import { TelemetriaRepository } from "../repositories/TelemetriaRepository";
import { MonitoramentoService } from "./MonitoramentoService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "telemetria" });

// Cache simples de ids de máquina válidos (evita 1 SELECT por mensagem MQTT).
// TTL curto: uma máquina nova aparece em no máximo 60s.
const CACHE_TTL_MS = 60_000;

export class TelemetriaService {

    private repository = new TelemetriaRepository();
    private monitoramento = new MonitoramentoService();

    private maquinasValidas = new Map<number, number>();

    /**
     * Recebe o payload cru vindo do MQTT, valida/normaliza e persiste.
     * Retorna a leitura normalizada + dados da máquina (para o WebSocket)
     * ou null quando a mensagem deve ser ignorada.
     */
    async registrarLeitura(
        maquinaId: number,
        payload: unknown
    ): Promise<ITelemetriaAtualComMaquina | null> {

        if (!Number.isInteger(maquinaId) || maquinaId <= 0) {
            throw new Error(`maquina_id inválido: ${maquinaId}`);
        }

        if (!payload || typeof payload !== "object") {
            throw new Error("Payload de telemetria não é um objeto JSON");
        }

        const existe = await this.maquinaExisteComCache(maquinaId);

        if (!existe) {
            // Não é erro: pode ser um device ainda não cadastrado.
            return null;
        }

        const dados = payload as Record<string, unknown>;

        const leitura: ITelemetriaLeitura = {
            maquina_id: maquinaId,
            temperatura: this.numeroOuNull(
                dados.temperatura ?? dados.temp ?? dados.temperature
            ),
            vibracao: this.numeroOuNull(
                dados.vibracao ?? dados.vibration ?? dados.vib
            ),
            horas_ligadas: this.numeroOuNull(
                dados.horas_ligadas ??
                dados.horasLigadas ??
                dados.hours ??
                dados.uptime_h
            ),
            payload_bruto: dados,
        };

        if (
            leitura.temperatura === null &&
            leitura.vibracao === null &&
            leitura.horas_ligadas === null
        ) {
            throw new Error(
                "Payload sem nenhuma métrica válida (temperatura/vibracao/horas_ligadas)"
            );
        }

        await this.repository.salvarLeitura(leitura);
        await this.repository.upsertAtual(leitura);

        // avalia limites / abre alerta se ficar fora pela janela configurada
        this.monitoramento
            .avaliarLeitura(maquinaId, {
                temperatura: leitura.temperatura,
                vibracao: leitura.vibracao,
                horas_ligadas: leitura.horas_ligadas,
            })
            .catch((e) => log.error({ err: e, maquinaId }, "falha ao avaliar leitura no motor de alertas"));

        return this.repository.buscarAtualPorMaquina(maquinaId);
    }

    listarAtual(empresaId: string): Promise<ITelemetriaAtualComMaquina[]> {
        return this.repository.listarAtual(empresaId);
    }

    buscarPorMaquina(
        maquinaId: number,
        empresaId: string
    ): Promise<ITelemetriaAtualComMaquina | null> {
        return this.repository.buscarAtualPorMaquina(maquinaId, empresaId);
    }

    listarHistorico(
        maquinaId: number,
        desde: Date | null,
        limite: number,
        empresaId: string
    ): Promise<ITelemetriaLeitura[]> {

        const limiteSeguro = Math.min(
            Math.max(Number(limite) || 200, 1),
            2000
        );

        return this.repository.listarHistorico(
            maquinaId,
            desde,
            limiteSeguro,
            empresaId
        );
    }

    private async maquinaExisteComCache(id: number): Promise<boolean> {
        const expira = this.maquinasValidas.get(id);

        if (expira && expira > Date.now()) {
            return true;
        }

        const existe = await this.repository.maquinaExiste(id);

        if (existe) {
            this.maquinasValidas.set(id, Date.now() + CACHE_TTL_MS);
        }

        return existe;
    }

    private numeroOuNull(valor: unknown): number | null {
        if (valor === null || valor === undefined || valor === "") {
            return null;
        }

        const n = Number(valor);

        // rejeita NaN, Infinity e -Infinity
        return Number.isFinite(n) ? n : null;
    }
}

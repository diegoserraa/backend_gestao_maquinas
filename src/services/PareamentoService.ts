import crypto from "crypto";
import { PareamentoRepository } from "../repositories/PareamentoRepository";
import { IPareamentoGerado, IPareamentoResgatado } from "../interfaces/Ipareamento";

const VALIDADE_MIN = 10;
const TENTATIVAS_CODIGO = 5;

export class PareamentoService {

    private repo = new PareamentoRepository();

    /** Gera um PIN de 6 dígitos pra mostrar na tela, pra digitar na placa. */
    async gerar(maquinaId: number, empresaId: string): Promise<IPareamentoGerado> {
        if (!(await this.repo.empresaDaMaquina(maquinaId, empresaId))) {
            throw new Error("Máquina não encontrada");
        }

        // só 1 PIN ativo por máquina — gerar um novo invalida o anterior
        await this.repo.invalidarAtivosDaMaquina(maquinaId);

        const expiraEm = new Date(Date.now() + VALIDADE_MIN * 60_000);

        for (let tentativa = 1; tentativa <= TENTATIVAS_CODIGO; tentativa++) {
            const codigo = this.gerarCodigo();
            try {
                const p = await this.repo.criar({
                    maquina_id: maquinaId,
                    empresa_id: empresaId,
                    codigo,
                    expira_em: expiraEm,
                });
                return { codigo: p.codigo, expira_em: p.expira_em };
            } catch (e: any) {
                // colisão rara com outro PIN ativo (índice único) — tenta outro código
                if (e?.code !== "23505" || tentativa === TENTATIVAS_CODIGO) throw e;
            }
        }

        throw new Error("Não foi possível gerar um código de pareamento");
    }

    /**
     * Resgate PÚBLICO (chamado pela placa, sem login): troca o PIN pelo
     * maquina_id que ela deve monitorar. Sem empresaId aqui de propósito —
     * o PIN já é o "token" de uma única máquina específica.
     */
    async resgatar(codigo: string, macDispositivo?: string): Promise<IPareamentoResgatado> {
        const pareamento = await this.repo.buscarAtivo(codigo);
        if (!pareamento) {
            throw new Error("Código inválido ou expirado");
        }

        await this.repo.marcarUsado(pareamento.id!, macDispositivo ?? null);

        const nome = await this.repo.nomeMaquina(pareamento.maquina_id);
        return { maquina_id: pareamento.maquina_id, maquina_nome: nome ?? `Máquina #${pareamento.maquina_id}` };
    }

    private gerarCodigo(): string {
        // 6 dígitos, sempre com zero à esquerda se precisar (ex.: "004521")
        const n = crypto.randomInt(0, 1_000_000);
        return String(n).padStart(6, "0");
    }
}

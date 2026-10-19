import { PlanoManutencaoRepository } from "../repositories/PlanoManutencaoRepository";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { IPlanoManutencao } from "../interfaces/Iplanomanutencao";
import { invalido, naoEncontrado } from "../utils/erros";

function dataMaisDias(base: Date, dias: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
}

export class PlanoManutencaoService {

    constructor(
        private repo = new PlanoManutencaoRepository(),
        private maquinaRepository = new MaquinaRepository()
    ) {}

    private async validarMaquina(maquinaId: number, empresaId: string) {
        const maquina = await this.maquinaRepository.buscarPorId(maquinaId, empresaId);
        if (!maquina) throw naoEncontrado("Máquina não encontrada");
    }

    async listar(maquinaId: number, empresaId: string) {
        await this.validarMaquina(maquinaId, empresaId);
        return this.repo.listarPorMaquina(maquinaId, empresaId);
    }

    /** Monta o ponto de partida (proxima_data ou horas_referencia) conforme o tipo.
     * `ultimaManutencao` (opcional, só DIAS) conta a partir dela em vez de hoje —
     * uso real: implantador cadastrando um plano que já estava rodando no cliente. */
    private async calcularPartida(
        maquinaId: number,
        tipo: "DIAS" | "HORAS",
        intervaloDias?: number,
        intervaloHoras?: number,
        ultimaManutencao?: string | null
    ): Promise<Pick<IPlanoManutencao, "proxima_data" | "horas_referencia">> {
        if (tipo === "DIAS") {
            const base = ultimaManutencao ? new Date(`${ultimaManutencao}T00:00:00`) : new Date();
            return { proxima_data: dataMaisDias(base, intervaloDias!), horas_referencia: null };
        }
        const horasAtuais = await this.repo.horasAtuais(maquinaId);
        if (horasAtuais === null) {
            throw invalido("Essa máquina ainda não tem leitura de horímetro (sensor) — use um plano por dias, ou espere a primeira leitura chegar.");
        }
        return { proxima_data: null, horas_referencia: horasAtuais };
    }

    async criar(maquinaId: number, dados: IPlanoManutencao, empresaId: string) {
        await this.validarMaquina(maquinaId, empresaId);

        const partida = await this.calcularPartida(
            maquinaId,
            dados.tipo_gatilho,
            dados.intervalo_dias ?? undefined,
            dados.intervalo_horas ?? undefined,
            dados.ultima_manutencao
        );

        return this.repo.criar(
            {
                maquina_id: maquinaId,
                descricao: dados.descricao,
                tipo_gatilho: dados.tipo_gatilho,
                intervalo_dias: dados.tipo_gatilho === "DIAS" ? dados.intervalo_dias : null,
                intervalo_horas: dados.tipo_gatilho === "HORAS" ? dados.intervalo_horas : null,
                ultima_manutencao: dados.ultima_manutencao ?? null,
                ativo: dados.ativo ?? true,
                ...partida,
            },
            empresaId
        );
    }

    async atualizar(id: number, maquinaId: number, dados: Partial<IPlanoManutencao>, empresaId: string) {
        const existente = await this.repo.buscarPorId(id, empresaId);
        if (!existente || existente.maquina_id !== maquinaId) throw naoEncontrado("Plano de manutenção não encontrado");

        const tipo = dados.tipo_gatilho ?? existente.tipo_gatilho;
        const mudouTipo = dados.tipo_gatilho && dados.tipo_gatilho !== existente.tipo_gatilho;
        const mudouIntervalo =
            (tipo === "DIAS" && dados.intervalo_dias != null && dados.intervalo_dias !== existente.intervalo_dias) ||
            (tipo === "HORAS" && dados.intervalo_horas != null && dados.intervalo_horas !== existente.intervalo_horas);
        const informouUltimaManutencao = dados.ultima_manutencao != null;

        // trocou o tipo de gatilho, o intervalo, ou informou quando foi feita pela
        // última vez: reinicia a contagem a partir do ponto certo — senão o plano
        // ficaria vencido (ou com data/horímetro de referência sem sentido)
        const partida = (mudouTipo || mudouIntervalo || informouUltimaManutencao)
            ? await this.calcularPartida(
                  maquinaId,
                  tipo,
                  dados.intervalo_dias ?? existente.intervalo_dias ?? undefined,
                  dados.intervalo_horas ?? existente.intervalo_horas ?? undefined,
                  dados.ultima_manutencao
              )
            : {};

        return this.repo.atualizar(
            id,
            {
                descricao: dados.descricao,
                tipo_gatilho: tipo,
                intervalo_dias: tipo === "DIAS" ? dados.intervalo_dias ?? existente.intervalo_dias : null,
                intervalo_horas: tipo === "HORAS" ? dados.intervalo_horas ?? existente.intervalo_horas : null,
                ultima_manutencao: dados.ultima_manutencao ?? existente.ultima_manutencao,
                ativo: dados.ativo,
                ...partida,
            },
            empresaId
        );
    }

    async excluir(id: number, maquinaId: number, empresaId: string) {
        const existente = await this.repo.buscarPorId(id, empresaId);
        if (!existente || existente.maquina_id !== maquinaId) throw naoEncontrado("Plano de manutenção não encontrado");
        await this.repo.excluir(id, empresaId);
    }

    /** "Aproveitar plano de manutenção": clona os planos ativos de outra máquina
     * pra esta — copia a tarefa/ritmo, mas a contagem começa do zero agora. */
    async clonarDeOutraMaquina(maquinaDestinoId: number, maquinaOrigemId: number, empresaId: string) {
        if (maquinaDestinoId === maquinaOrigemId) throw invalido("Escolha uma máquina diferente pra copiar os planos");

        await this.validarMaquina(maquinaDestinoId, empresaId);
        await this.validarMaquina(maquinaOrigemId, empresaId);

        const origem = (await this.repo.listarPorMaquina(maquinaOrigemId, empresaId)).filter((p) => p.ativo);
        if (origem.length === 0) throw invalido("A máquina escolhida não tem planos de manutenção ativos");

        const criados = [];
        const ignorados: { descricao: string; motivo: string }[] = [];

        for (const plano of origem) {
            try {
                criados.push(
                    await this.criar(
                        maquinaDestinoId,
                        {
                            maquina_id: maquinaDestinoId,
                            descricao: plano.descricao,
                            tipo_gatilho: plano.tipo_gatilho,
                            intervalo_dias: plano.intervalo_dias,
                            intervalo_horas: plano.intervalo_horas,
                        },
                        empresaId
                    )
                );
            } catch (erro: any) {
                // ex.: plano por horas, mas a máquina de destino ainda não tem sensor —
                // pula esse em vez de abortar a cópia dos outros
                ignorados.push({ descricao: plano.descricao, motivo: erro.message ?? "erro desconhecido" });
            }
        }
        return { criados, ignorados };
    }
}

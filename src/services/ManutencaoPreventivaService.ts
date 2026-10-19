import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { PlanoManutencaoRepository } from "../repositories/PlanoManutencaoRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "manutencao-preventiva" });

export class ManutencaoPreventivaService {


    constructor(
        private maquinaRepository: MaquinaRepository,
        private ordemServicoRepository: OrdemServicoRepository,
        private usuarioRepository: UsuarioRepository,
        private notificacaoSistemaService: NotificacaoSistemaService,
        private planoManutencaoRepository: PlanoManutencaoRepository = new PlanoManutencaoRepository()
    ){}

    async gerarOrdensPreventivas(){
        const hoje = new Date();
        const dataProxima =
            hoje.toISOString().split("T")[0];

        const maquinas =
            await this.maquinaRepository
            .buscarPorDataProximaManutencao(
                dataProxima
            );

        log.info({ data: dataProxima, total: maquinas.length }, "varredura de preventivas");

        for(const maquina of maquinas){
            try {
                // varredura global (todas as empresas) — cada linha já
                // carrega seu próprio empresa_id, usado daqui pra baixo
                const empresaId: string = maquina.empresa_id;

                const ordemExistente =
                    await this.ordemServicoRepository
                    .existePreventivaPendente(
                        maquina.id,
                        empresaId
                    );
                if(ordemExistente){
                    log.debug({ maquinaId: maquina.id }, "já tem preventiva pendente, pulando");
                    continue;

                }
                const ordem =
                    await this.ordemServicoRepository.criar({
                        maquina_id: maquina.id,
                        tipo_manutencao:"PREVENTIVA",
                        prioridade:"MEDIA",
                        status:"ABERTA",
                        descricao:
                        "Manutenção preventiva gerada automaticamente pelo sistema."

                    }, empresaId);

                log.info({ osId: ordem.id, maquinaId: maquina.id, empresaId }, "O.S. preventiva criada automaticamente");

                const usuarios =
                    await this.usuarioRepository
                    .buscarGestoresETecnicos(empresaId);

                for(const usuario of usuarios){
                    try {
                        await this.notificacaoSistemaService.notificar(
                            usuario.id,
                            "Nova manutenção preventiva",
                            `A máquina ${maquina.nome} possui uma nova OS preventiva criada automaticamente.`,
                            "PREVENTIVA",
                            `/ordens-servico/${ordem.id}`

                        );
                    } catch(error){
                        log.error({ err: error, usuarioId: usuario.id, osId: ordem.id }, "erro ao notificar usuário sobre preventiva");
                    }
                }
            } catch(error){
                log.error({ err: error, maquinaId: maquina.id }, "erro ao processar máquina na varredura de preventivas");
            }
        }
    }

    /** Mesma ideia de gerarOrdensPreventivas, mas pros planos de manutenção
     * (vários por máquina, cada um gerando sua própria O.S.) — roda em
     * paralelo ao mecanismo legado (campo único da máquina), sem conflito:
     * um plano nunca é bloqueado pela O.S. pendente de outro plano. */
    async gerarOrdensDosPlanos() {
        const hoje = new Date().toISOString().split("T")[0];

        const [vencidosDias, vencidosHoras] = await Promise.all([
            this.planoManutencaoRepository.buscarVencidosPorDias(hoje),
            this.planoManutencaoRepository.buscarVencidosPorHoras(),
        ]);
        const planos = [...vencidosDias, ...vencidosHoras];

        log.info({ total: planos.length }, "varredura de planos de manutenção");

        for (const plano of planos) {
            try {
                const empresaId = plano.empresa_id!;

                const jaPendente = await this.ordemServicoRepository.existePendentePorPlano(plano.id!, empresaId);
                if (jaPendente) {
                    log.debug({ planoId: plano.id }, "plano já tem O.S. pendente, pulando");
                    continue;
                }

                const ordem = await this.ordemServicoRepository.criar(
                    {
                        maquina_id: plano.maquina_id,
                        tipo_manutencao: "PREVENTIVA",
                        prioridade: "MEDIA",
                        status: "ABERTA",
                        descricao: plano.descricao,
                        plano_manutencao_id: plano.id,
                    },
                    empresaId
                );

                log.info({ osId: ordem.id, planoId: plano.id, maquinaId: plano.maquina_id, empresaId }, "O.S. preventiva criada a partir de um plano");

                const usuarios = await this.usuarioRepository.buscarGestoresETecnicos(empresaId);
                for (const usuario of usuarios) {
                    try {
                        await this.notificacaoSistemaService.notificar(
                            usuario.id,
                            "Nova manutenção preventiva",
                            `A máquina ${plano.maquina_nome} possui uma nova OS preventiva (${plano.descricao}) criada automaticamente.`,
                            "PREVENTIVA",
                            `/ordens-servico/${ordem.id}`
                        );
                    } catch (error) {
                        log.error({ err: error, usuarioId: usuario.id, osId: ordem.id }, "erro ao notificar usuário sobre plano de preventiva");
                    }
                }
            } catch (error) {
                log.error({ err: error, planoId: plano.id }, "erro ao processar plano na varredura de preventivas");
            }
        }
    }
}

import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "manutencao-preventiva" });

export class ManutencaoPreventivaService {


    constructor(
        private maquinaRepository: MaquinaRepository,
        private ordemServicoRepository: OrdemServicoRepository,
        private usuarioRepository: UsuarioRepository,
        private notificacaoSistemaService: NotificacaoSistemaService
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
}

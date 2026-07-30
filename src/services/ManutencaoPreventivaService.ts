import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";


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
        console.log(
            "📅 Buscando manutenção para:",
            dataProxima
        );
        const maquinas =
            await this.maquinaRepository
            .buscarPorDataProximaManutencao(
                dataProxima
            );
        console.log(
            "🔎 Máquinas encontradas:",
            maquinas.length,
            dataProxima
        );
        for(const maquina of maquinas){
            try {
                console.log(
                    "⚙️ Processando máquina:",
                    maquina.id,
                    maquina.nome
                );
                const ordemExistente =
                    await this.ordemServicoRepository
                    .existePreventivaPendente(
                        maquina.id
                    );
                if(ordemExistente){
                    console.log(
                        "⚠️ Já possui preventiva pendente:",
                        maquina.id
                    );
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

                    });
                console.log(
                    "✅ OS preventiva criada:",
                    ordem.id
                );
                const usuarios =
                    await this.usuarioRepository
                    .buscarGestoresETecnicos();

                for(const usuario of usuarios){
                    try {
                        await this.notificacaoSistemaService.notificar(
                            usuario.id,
                            "Nova manutenção preventiva",
                            `A máquina ${maquina.nome} possui uma nova OS preventiva criada automaticamente.`,
                            "PREVENTIVA",
                            `/machines/${maquina.id}`

                        );
                        console.log(
                            "🔔 Notificação enviada para:",
                            usuario.id
                        );
                    } catch(error){
                        console.error(
                            "⚠️ Erro ao notificar usuário:",
                            usuario.id,
                            error
                        );
                    }
                }
            } catch(error){
                console.error(
                    "❌ Erro ao processar máquina preventiva:",
                    maquina.id,
                    error
                );
            }
        }
    }
}
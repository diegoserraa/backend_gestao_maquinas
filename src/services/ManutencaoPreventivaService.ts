import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { NotificacaoService } from "./NotificacaoService";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { PushNotificationService } from "./PushNotificationService";


export class ManutencaoPreventivaService {


    constructor(
        private maquinaRepository: MaquinaRepository,
        private ordemServicoRepository: OrdemServicoRepository,
        private notificacaoService: NotificacaoService,
        private usuarioRepository: UsuarioRepository,
        private pushNotificationService: PushNotificationService
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
                    "⚠️ Já possui preventiva:",
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
                "✅ OS criada:",
                ordem.id
            );









            const usuarios =
                await this.usuarioRepository.buscarGestoresETecnicos();






            for(const usuario of usuarios){



                const titulo =
                "Nova manutenção preventiva";



                const mensagem =
                `A máquina ${maquina.nome} possui uma nova OS preventiva criada automaticamente.`;






                /*
                 * Salva no banco
                 */

                await this.notificacaoService.criar({

                    usuario_id: usuario.id,

                    titulo,

                    mensagem,

                    tipo:"PREVENTIVA"

                });







                /*
                 * Envia Push
                 */

                try {


                    await this.pushNotificationService.enviarParaUsuario(

                        usuario.id,

                        titulo,

                        mensagem,

                        `/machines/${maquina.id}`

                    );



                    console.log(
                        "📲 Push enviado para:",
                        usuario.id
                    );



                } catch(error){


                    console.error(
                        "⚠️ Erro ao enviar push para usuário:",
                        usuario.id,
                        error
                    );


                    /*
                     * Não derruba o job caso
                     * um usuário não tenha subscription
                     */

                }





                console.log(
                    "🔔 Notificação criada para:",
                    usuario.id
                );


            }


        }


    }


}
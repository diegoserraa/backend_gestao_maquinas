import { NotificacaoService } from "./NotificacaoService";
import { PushNotificationService } from "./PushNotificationService";

export class NotificacaoSistemaService {

    constructor(
        private notificacaoService: NotificacaoService,
        private pushService: PushNotificationService
        
    ) {}


    private async enviar(
        usuario_id: number,
        titulo: string,
        mensagem: string,
        tipo: string,
        url?: string
    ): Promise<void> {

        await this.notificacaoService.criar({
            usuario_id,
            titulo,
            mensagem,
            tipo,
            url
        });

        try {

            await this.pushService.enviarParaUsuario(
                usuario_id,
                titulo,
                mensagem,
                url
            );

        } catch(error) {

            console.error(
                "Erro ao enviar push para usuário:",
                usuario_id,
                error
            );

        }

    }


    // Usado pela preventiva automática
    async notificar(
        usuario_id: number,
        titulo: string,
        mensagem: string,
        tipo: string,
        url?: string
    ): Promise<void> {

        await this.enviar(
            usuario_id,
            titulo,
            mensagem,
            tipo,
            url
        );

    }


    // Operador abriu OS
    // Notifica gestores e técnicos
async notificarOSCriada(
    gestores_ids: number[],
    tecnicos_ids: number[],
    maquina_nome: string,
    maquina_id: number
): Promise<void> {

    const mensagem =
        `Foi aberta uma nova OS para maquina ${maquina_nome}.`;

    for(const gestor_id of gestores_ids){

        await this.enviar(
            gestor_id,
            "Nova ordem de serviço",
            mensagem,
            "OS_CRIADA",
            `/machines/${maquina_id}`
        );

    }

    for(const tecnico_id of tecnicos_ids){

        await this.enviar(
            tecnico_id,
            "Nova manutenção disponível",
            mensagem,
            "OS_DISPONIVEL",
            `/machines/${maquina_id}`
        );

    }

}



    // Gestor atribuiu uma OS para um técnico específico
    async notificarOSTecnicoAtribuida(
        tecnico_id: number,
        maquina_nome: string,
        ordem_id: number
    ): Promise<void> {

        await this.enviar(
            tecnico_id,
            "Nova OS atribuída",
            `Você recebeu uma manutenção para a máquina ${maquina_nome}.`,
            "OS_ATRIBUIDA",
            `/ordens-servico/${ordem_id}`
        );

    }



    // Técnico finalizou a OS
    // Notifica gestor e operador
    async notificarOSFinalizada(
        gestor_id: number,
        operador_id: number,
        maquina_nome: string,
        ordem_id: number
    ): Promise<void> {

        const mensagem =
            `A manutenção da máquina ${maquina_nome} foi finalizada.`;


        await this.enviar(
            gestor_id,
            "Manutenção finalizada",
            mensagem,
            "OS_FINALIZADA",
            `/ordens-servico/${ordem_id}`
        );


        if(operador_id !== gestor_id) {

            await this.enviar(
                operador_id,
                "Solicitação concluída",
                mensagem,
                "OS_FINALIZADA",
                `/ordens-servico/${ordem_id}`
            );

        }

    }

}
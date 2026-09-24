import { NotificacaoService } from "./NotificacaoService";
import { PushNotificationService } from "./PushNotificationService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "notificacao" });

// Quantos destinatários são notificados ao mesmo tempo (o pool do banco tem 10 conexões).
const CONCORRENCIA = 10;

/** Executa as tarefas em lotes; a falha de uma não impede as outras. */
async function emLotes(tarefas: Array<() => Promise<void>>): Promise<void> {
    for (let i = 0; i < tarefas.length; i += CONCORRENCIA) {
        const resultados = await Promise.allSettled(tarefas.slice(i, i + CONCORRENCIA).map((t) => t()));

        for (const r of resultados) {
            if (r.status === "rejected") log.error({ err: r.reason }, "falha ao notificar um destinatário");
        }
    }
}

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

            log.error({ err: error, usuarioId: usuario_id }, "erro ao enviar push");

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
    ordem_id: number
): Promise<void> {

    const mensagem =
        `Foi aberta uma nova OS para maquina ${maquina_nome}.`;

    const url = `/ordens-servico/${ordem_id}`;

    // em paralelo (em lotes): uma empresa com dezenas de usuários não pode deixar
    // quem abre a O.S. esperando uma notificação por vez
    await emLotes([
        ...gestores_ids.map((id) => () =>
            this.enviar(id, "Nova ordem de serviço", mensagem, "OS_CRIADA", url)
        ),
        ...tecnicos_ids.map((id) => () =>
            this.enviar(id, "Nova manutenção disponível", mensagem, "OS_DISPONIVEL", url)
        ),
    ]);

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
import webpush from "web-push";

import { PushSubscriptionRepository }
from "../repositories/PushSubscriptionRepository";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "push" });

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export class PushNotificationService {

    private repository =
        new PushSubscriptionRepository();

    async enviarParaUsuario(
        usuario_id: number,
        titulo: string,
        mensagem: string,
        url?: string
    ): Promise<void> {

        const subscriptions =
            await this.repository
                .listarPorUsuario(usuario_id);

        if (!subscriptions.length) {
            // comum (usuário nunca ativou push) — não é um problema, não
            // vale poluir o log em nível info/warn
            log.debug({ usuarioId: usuario_id }, "sem subscription de push");
            return;
        }

        const payload = JSON.stringify({
            title: titulo,
            body: mensagem,
            url: url ?? "/"
        });

        for (const subscription of subscriptions) {

            try {

                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth
                        }
                    },
                    payload
                );

                log.debug({ usuarioId: usuario_id }, "push enviado");

            } catch (error: any) {

                log.error({ err: error, usuarioId: usuario_id }, "erro ao enviar push");

            }

        }

    }

}
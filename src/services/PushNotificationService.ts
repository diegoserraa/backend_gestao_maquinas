import webpush from "web-push";

import { PushSubscriptionRepository }
from "../repositories/PushSubscriptionRepository";

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

            console.log(
                `⚠️ Nenhuma subscription encontrada para o usuário ${usuario_id}`
            );

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

                console.log(
                    `✅ Push enviado para usuário ${usuario_id}`
                );

            } catch (error: any) {

                console.error(
                    `❌ Erro ao enviar push para usuário ${usuario_id}`,
                    error?.message
                );

            }

        }

    }

}
import { pool } from "../database/connection";
import { IPushSubscription } from "../interfaces/IPushSubscription";

export class PushSubscriptionRepository {

    async criar(
        subscription: IPushSubscription
    ): Promise<IPushSubscription> {

        const { rows } = await pool.query(
            `
            INSERT INTO push_subscriptions
            (
                usuario_id,
                endpoint,
                p256dh,
                auth
            )
            VALUES
            ($1,$2,$3,$4)

            RETURNING *
            `,
            [
                subscription.usuario_id,
                subscription.endpoint,
                subscription.p256dh,
                subscription.auth
            ]
        );

        return rows[0];
    }

    async listarPorUsuario(
        usuario_id: number
    ): Promise<IPushSubscription[]> {

        const { rows } = await pool.query(
            `
            SELECT *
            FROM push_subscriptions

            WHERE usuario_id = $1
            `,
            [usuario_id]
        );

        return rows;
    }

    async excluir(
        id: number
    ): Promise<void> {

        await pool.query(
            `
            DELETE FROM push_subscriptions
            WHERE id = $1
            `,
            [id]
        );
    }
}
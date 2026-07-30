import { pool } from "../database/connection";
import { INotificacao } from "../interfaces/Inotificacao";

export class NotificacaoRepository {

    async criar(
        notificacao: INotificacao
    ): Promise<INotificacao> {
        console.log("notificacao", notificacao);
        const { rows } = await pool.query(
            `
            INSERT INTO notificacoes
            (
                usuario_id,
                titulo,
                mensagem,
                tipo,
                url
            )
            VALUES
            ($1,$2,$3,$4,$5)

            RETURNING *
            `,
            [
                notificacao.usuario_id,
                notificacao.titulo,
                notificacao.mensagem,
                notificacao.tipo,
                notificacao.url 
            ]
        );

        return rows[0];
    }

    async listarPorUsuario(
        usuario_id: number
    ): Promise<INotificacao[]> {

        const { rows } = await pool.query(
            `
            SELECT *
            FROM notificacoes

            WHERE usuario_id = $1
            AND excluida = false

            ORDER BY created_at DESC
            `,
            [
                usuario_id
            ]
        );

        return rows;
    }

    async listarNaoLidas(
        usuario_id: number
    ): Promise<INotificacao[]> {

        const { rows } = await pool.query(
            `
            SELECT *
            FROM notificacoes

            WHERE usuario_id = $1
            AND lida = false
            AND excluida = false

            ORDER BY created_at DESC
            `,
            [
                usuario_id
            ]
        );

        return rows;
    }

    async contarNaoLidas(
        usuario_id: number
    ): Promise<number> {

        const { rows } = await pool.query(
            `
            SELECT COUNT(*)::int AS total

            FROM notificacoes

            WHERE usuario_id = $1
            AND lida = false
            AND excluida = false
            `,
            [
                usuario_id
            ]
        );

        return rows[0].total;
    }

    async marcarComoLida(
        id: number
    ): Promise<void> {

        await pool.query(
            `
            UPDATE notificacoes

            SET lida = true

            WHERE id = $1
            `,
            [
                id
            ]
        );
    }

    async marcarTodasComoLidas(
        usuario_id: number
    ): Promise<void> {

        await pool.query(
            `
            UPDATE notificacoes

            SET lida = true

            WHERE usuario_id = $1
            AND excluida = false
            `,
            [
                usuario_id
            ]
        );
    }

    async excluir(
        id: number
    ): Promise<void> {

        await pool.query(
            `
            UPDATE notificacoes

            SET
                excluida = true,
                data_exclusao = NOW()

            WHERE id = $1
            `,
            [
                id
            ]
        );
    }

}
import { pool } from "../database/connection";
import { IUsuario } from "../interfaces/Iusuario";

export class UsuarioRepository {

    async listar(): Promise<IUsuario[]> {
        const { rows } = await pool.query(
            `SELECT id, nome, email, role, ativo, created_at FROM usuarios ORDER BY id DESC`
        );

        return rows;
    }

    async buscarPorId(id: number): Promise<IUsuario | null> {
        const { rows } = await pool.query(
            `SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE id = $1`,
            [id]
        );

        return rows[0] ?? null;
    }

    async buscarPorEmail(email: string): Promise<IUsuario | null> {
        const { rows } = await pool.query(
            `SELECT * FROM usuarios WHERE email = $1`,
            [email]
        );

        return rows[0] ?? null;
    }

    async criar(user: IUsuario): Promise<IUsuario> {
        const { rows } = await pool.query(
            `
            INSERT INTO usuarios (nome, email, senha, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nome, email, role, ativo, created_at
            `,
            [user.nome, user.email, user.senha, user.role]
        );

        return rows[0];
    }

    async atualizar(id: number, user: IUsuario): Promise<IUsuario> {
        const { rows } = await pool.query(
            `
            UPDATE usuarios
            SET nome = $1,
                email = $2,
                role = $3,
                ativo = $4
            WHERE id = $5
            RETURNING id, nome, email, role, ativo, created_at
            `,
            [user.nome, user.email, user.role, user.ativo, id]
        );

        return rows[0];
    }

    async excluir(id: number): Promise<void> {
        await pool.query(`DELETE FROM usuarios WHERE id = $1`, [id]);
    }
    async alternarStatus(id: number, ativo: boolean): Promise<IUsuario> {
    const { rows } = await pool.query(
        `
        UPDATE usuarios
        SET ativo = $1
        WHERE id = $2
        RETURNING id, nome, email, role, ativo, created_at
        `,
        [ativo, id]
    );

    return rows[0];
    }
    async listarTecnicos(): Promise<IUsuario[]> {
    const { rows } = await pool.query(
        `
        SELECT id, nome
        FROM usuarios
        WHERE role = 'TECNICO'
          AND ativo = true
        ORDER BY nome
        `
    );

    return rows;
}
}
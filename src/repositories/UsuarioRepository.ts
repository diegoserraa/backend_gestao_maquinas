import { pool } from "../database/connection";
import { IUsuario } from "../interfaces/Iusuario";

export class UsuarioRepository {

    async listar(empresaId: string): Promise<IUsuario[]> {
        const { rows } = await pool.query(
            `SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE empresa_id = $1 ORDER BY id DESC`,
            [empresaId]
        );

        return rows;
    }

    async buscarPorId(id: number, empresaId: string): Promise<IUsuario | null> {
        const { rows } = await pool.query(
            `SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );

        return rows[0] ?? null;
    }

    // Usada só no login (antes de existir token) — email é único globalmente,
    // não por empresa, então de propósito NÃO filtra por empresa_id.
    async buscarPorEmail(email: string): Promise<IUsuario | null> {
        const { rows } = await pool.query(
            `SELECT * FROM usuarios WHERE email = $1`,
            [email]
        );

        return rows[0] ?? null;
    }

    // hash da senha (só para conferir a senha atual na troca de senha)
    async buscarSenhaHash(id: number): Promise<string | null> {
        const { rows } = await pool.query(`SELECT senha FROM usuarios WHERE id = $1`, [id]);
        return rows[0]?.senha ?? null;
    }

    // nova senha: encerra a condição de "senha temporária" e a sessão de qualquer token antigo (devolve a versão nova)
    async atualizarSenha(id: number, senhaHash: string): Promise<number> {
        const { rows } = await pool.query(
            `UPDATE usuarios SET senha = $1, deve_trocar_senha = false, versao_sessao = versao_sessao + 1
              WHERE id = $2 RETURNING versao_sessao`,
            [senhaHash, id]
        );
        return rows[0].versao_sessao;
    }

    async registrarAcesso(id: number): Promise<void> {
        await pool.query(`UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1`, [id]);
    }

    async criar(user: IUsuario): Promise<IUsuario> {
        const { rows } = await pool.query(
            `
            INSERT INTO usuarios (nome, email, senha, role, empresa_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, nome, email, role, ativo, created_at
            `,
            [user.nome, user.email, user.senha, user.role, user.empresa_id]
        );

        return rows[0];
    }

    async atualizar(id: number, user: IUsuario, empresaId: string): Promise<IUsuario> {
        const { rows } = await pool.query(
            `
            UPDATE usuarios
            SET nome = $1,
                email = $2,
                role = $3,
                ativo = COALESCE($4, ativo)
            WHERE id = $5 AND empresa_id = $6
            RETURNING id, nome, email, role, ativo, created_at
            `,
            [user.nome, user.email, user.role, user.ativo, id, empresaId]
        );

        return rows[0];
    }

    async excluir(id: number, empresaId: string): Promise<void> {
        await pool.query(`DELETE FROM usuarios WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
    }
    async alternarStatus(id: number, ativo: boolean, empresaId: string): Promise<IUsuario> {
    const { rows } = await pool.query(
        `
        UPDATE usuarios
        SET ativo = $1
        WHERE id = $2 AND empresa_id = $3
        RETURNING id, nome, email, role, ativo, created_at
        `,
        [ativo, id, empresaId]
    );

    return rows[0];
    }
    async listarTecnicos(empresaId: string): Promise<IUsuario[]> {
    const { rows } = await pool.query(
        `
        SELECT id, nome
        FROM usuarios
        WHERE role = 'TECNICO'
          AND ativo = true
          AND empresa_id = $1
        ORDER BY nome
        `,
        [empresaId]
    );

    return rows;
}
async buscarGestoresETecnicos(empresaId: string) {

    const { rows } = await pool.query(
        `
        SELECT id, role
        FROM usuarios
        WHERE role IN ('GESTOR', 'TECNICO')
          AND ativo = true
          AND empresa_id = $1
        `,
        [empresaId]
    );

    return rows;
}
}
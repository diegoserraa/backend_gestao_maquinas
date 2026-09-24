import { PoolClient } from "pg";
import { pool } from "../database/connection";

export interface UsuarioPermissoes {
    id: number;
    nome: string;
    email: string;
    role: string;
    ativo: boolean;
    empresa_id: string;
    inicializadas: boolean;
    permissoes: string[];
}

export interface RegistroAuditoria {
    id: number;
    acao: string;
    alterado_por: number | null;
    alterado_por_nome: string | null;
    usuario_alvo: number | null;
    usuario_alvo_nome: string | null;
    antes: string[];
    depois: string[];
    criado_em: string;
}

export class PermissaoRepository {

    /** Usuário + permissões numa consulta só (sem filtro de empresa: quem chama confere). */
    async carregar(usuarioId: number): Promise<UsuarioPermissoes | null> {
        const { rows } = await pool.query(
            `
            SELECT
                u.id, u.nome, u.email, u.role, u.ativo, u.empresa_id,
                u.permissoes_inicializadas AS inicializadas,
                COALESCE(array_agg(p.permissao) FILTER (WHERE p.permissao IS NOT NULL), '{}') AS permissoes
            FROM usuarios u
            LEFT JOIN usuario_permissoes p ON p.usuario_id = u.id
            WHERE u.id = $1
            GROUP BY u.id
            `,
            [usuarioId]
        );

        return rows[0] ?? null;
    }

    /** Mesma coisa, mas só se o usuário for da empresa informada. */
    async carregarDaEmpresa(usuarioId: number, empresaId: string): Promise<UsuarioPermissoes | null> {
        const u = await this.carregar(usuarioId);
        return u && u.empresa_id === empresaId ? u : null;
    }

    /**
     * Grava o conjunto inteiro (substitui) e marca o usuário como inicializado.
     * `cliente` permite juntar a auditoria na mesma transação.
     */
    async substituir(
        usuarioId: number,
        empresaId: string,
        permissoes: string[],
        cliente: PoolClient | null = null
    ): Promise<void> {
        const exec = cliente ?? (await pool.connect());

        try {
            if (!cliente) await exec.query("BEGIN");

            await exec.query(`DELETE FROM usuario_permissoes WHERE usuario_id = $1`, [usuarioId]);

            if (permissoes.length > 0) {
                await exec.query(
                    `INSERT INTO usuario_permissoes (usuario_id, permissao, empresa_id)
                     SELECT $1, p, $3 FROM unnest($2::text[]) AS p`,
                    [usuarioId, permissoes, empresaId]
                );
            }

            await exec.query(`UPDATE usuarios SET permissoes_inicializadas = true WHERE id = $1`, [usuarioId]);

            if (!cliente) await exec.query("COMMIT");
        } catch (erro) {
            if (!cliente) await exec.query("ROLLBACK");
            throw erro;
        } finally {
            if (!cliente) (exec as PoolClient).release();
        }
    }

    /**
     * Aplica o padrão só se ainda não foi inicializado (migração "preguiçosa" dos usuários antigos).
     * Seguro contra corrida: ON CONFLICT + só um vencedor no UPDATE.
     */
    async inicializarSeNecessario(usuarioId: number, empresaId: string, permissoes: string[]): Promise<void> {
        const cliente = await pool.connect();

        try {
            await cliente.query("BEGIN");

            const { rows } = await cliente.query(
                `UPDATE usuarios SET permissoes_inicializadas = true
                 WHERE id = $1 AND permissoes_inicializadas = false
                 RETURNING id`,
                [usuarioId]
            );

            if (rows.length > 0 && permissoes.length > 0) {
                await cliente.query(
                    `INSERT INTO usuario_permissoes (usuario_id, permissao, empresa_id)
                     SELECT $1, p, $3 FROM unnest($2::text[]) AS p
                     ON CONFLICT DO NOTHING`,
                    [usuarioId, permissoes, empresaId]
                );
            }

            await cliente.query("COMMIT");
        } catch (erro) {
            await cliente.query("ROLLBACK");
            throw erro;
        } finally {
            cliente.release();
        }
    }

    async registrarAuditoria(
        dados: {
            empresaId: string;
            alteradoPor: number | null;
            usuarioAlvo: number;
            acao: string;
            antes: string[];
            depois: string[];
        },
        cliente: PoolClient | null = null
    ): Promise<void> {
        await (cliente ?? pool).query(
            `INSERT INTO auditoria_permissoes (empresa_id, alterado_por, usuario_alvo, acao, antes, depois)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
            [dados.empresaId, dados.alteradoPor, dados.usuarioAlvo, dados.acao, JSON.stringify(dados.antes), JSON.stringify(dados.depois)]
        );
    }

    async listarAuditoria(empresaId: string, limite: number, usuarioAlvo?: number): Promise<RegistroAuditoria[]> {
        const { rows } = await pool.query(
            `
            SELECT a.id, a.acao, a.alterado_por, ator.nome AS alterado_por_nome,
                   a.usuario_alvo, alvo.nome AS usuario_alvo_nome,
                   a.antes, a.depois, a.criado_em
            FROM auditoria_permissoes a
            LEFT JOIN usuarios ator ON ator.id = a.alterado_por
            LEFT JOIN usuarios alvo ON alvo.id = a.usuario_alvo
            WHERE a.empresa_id = $1
              AND ($3::int IS NULL OR a.usuario_alvo = $3)
            ORDER BY a.criado_em DESC, a.id DESC
            LIMIT $2
            `,
            [empresaId, limite, usuarioAlvo ?? null]
        );

        return rows;
    }

    /**
     * Trava a linha do usuário até o fim da transação: duas alterações simultâneas no
     * mesmo funcionário passam a acontecer uma depois da outra (a última vence, sem mistura).
     */
    async travarUsuario(cliente: PoolClient, usuarioId: number): Promise<void> {
        await cliente.query(`SELECT id FROM usuarios WHERE id = $1 FOR UPDATE`, [usuarioId]);
    }

    /** Permissões gravadas agora (leitura dentro da transação, já com o usuário travado). */
    async permissoesGravadas(cliente: PoolClient, usuarioId: number): Promise<string[]> {
        const { rows } = await cliente.query(
            `SELECT permissao FROM usuario_permissoes WHERE usuario_id = $1`,
            [usuarioId]
        );
        return rows.map((r) => r.permissao);
    }

    /** Transação usada pelo serviço pra juntar substituição + auditoria. */
    async comTransacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
        const cliente = await pool.connect();

        try {
            await cliente.query("BEGIN");
            const resultado = await fn(cliente);
            await cliente.query("COMMIT");
            return resultado;
        } catch (erro) {
            await cliente.query("ROLLBACK");
            throw erro;
        } finally {
            cliente.release();
        }
    }
}

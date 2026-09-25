import { PoolClient } from "pg";
import { pool } from "../database/connection";

export interface UsuarioPermissoes {
    id: number;
    nome: string;
    email: string;
    role: string;
    ativo: boolean;
    empresa_id: string;
    /** a empresa do usuário está ativa? (o dono do sistema pode inativar uma empresa inteira) */
    empresa_ativa: boolean;
    /** senha temporária: precisa trocar antes de usar o sistema */
    deve_trocar_senha: boolean;
    /** sobe quando a senha é trocada: tokens de versão antiga deixam de valer */
    versao_sessao: number;
    inicializadas: boolean;
    /** true = ajustado individualmente (tem prioridade sobre as alterações em grupo) */
    personalizadas: boolean;
    permissoes: string[];
}

const SELECT_USUARIO_COM_PERMISSOES = `
    SELECT
        u.id, u.nome, u.email, u.role, u.ativo, u.empresa_id,
        e.ativo AS empresa_ativa,
        u.deve_trocar_senha,
        u.versao_sessao,
        u.permissoes_inicializadas AS inicializadas,
        u.permissoes_personalizadas AS personalizadas,
        COALESCE(array_agg(p.permissao) FILTER (WHERE p.permissao IS NOT NULL), '{}') AS permissoes
    FROM usuarios u
    LEFT JOIN usuario_permissoes p ON p.usuario_id = u.id
    JOIN empresas e ON e.id = u.empresa_id
`;

export class PermissaoRepository {

    /** Usuário + permissões numa consulta só (sem filtro de empresa: quem chama confere). */
    async carregar(usuarioId: number): Promise<UsuarioPermissoes | null> {
        const { rows } = await pool.query(
            `${SELECT_USUARIO_COM_PERMISSOES} WHERE u.id = $1 GROUP BY u.id, e.id`,
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
     * `personalizada`: true = ajuste individual (prioridade sobre o grupo), false = volta a seguir
     * o grupo/padrão, null = não mexe na marca (alterações em grupo).
     * `cliente` permite juntar a auditoria na mesma transação.
     */
    async substituir(
        usuarioId: number,
        empresaId: string,
        permissoes: string[],
        cliente: PoolClient | null = null,
        personalizada: boolean | null = null
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

            await exec.query(
                `UPDATE usuarios
                 SET permissoes_inicializadas = true,
                     permissoes_personalizadas = COALESCE($2::boolean, permissoes_personalizadas)
                 WHERE id = $1`,
                [usuarioId, personalizada]
            );

            if (!cliente) await exec.query("COMMIT");
        } catch (erro) {
            if (!cliente) await exec.query("ROLLBACK");
            throw erro;
        } finally {
            if (!cliente) (exec as PoolClient).release();
        }
    }

    /**
     * Grava as permissões de VÁRIOS funcionários em 3 comandos (apagar, inserir, marcar) —
     * o custo não cresce com a quantidade de pessoas. Não mexe na marca de "ajuste individual".
     */
    async substituirVarios(
        cliente: PoolClient,
        empresaId: string,
        itens: { id: number; permissoes: string[] }[]
    ): Promise<void> {
        if (itens.length === 0) return;

        const ids = itens.map((i) => i.id);

        await cliente.query(`DELETE FROM usuario_permissoes WHERE usuario_id = ANY($1::int[])`, [ids]);

        const donos: number[] = [];
        const chaves: string[] = [];
        for (const i of itens) {
            for (const p of i.permissoes) {
                donos.push(i.id);
                chaves.push(p);
            }
        }

        if (donos.length > 0) {
            await cliente.query(
                `INSERT INTO usuario_permissoes (usuario_id, permissao, empresa_id)
                 SELECT u, p, $3 FROM unnest($1::int[], $2::text[]) AS t(u, p)`,
                [donos, chaves, empresaId]
            );
        }

        await cliente.query(`UPDATE usuarios SET permissoes_inicializadas = true WHERE id = ANY($1::int[])`, [ids]);
    }

    /** Um registro interno por funcionário alterado, todos num comando só. */
    async registrarAuditoriaVarios(
        cliente: PoolClient,
        dados: {
            empresaId: string;
            alteradoPor: number | null;
            acao: string;
            itens: { usuarioAlvo: number; antes: string[]; depois: string[] }[];
        }
    ): Promise<void> {
        if (dados.itens.length === 0) return;

        await cliente.query(
            `INSERT INTO auditoria_permissoes (empresa_id, alterado_por, usuario_alvo, acao, antes, depois)
             SELECT $1, $2, t.u, $3, t.a::jsonb, t.d::jsonb
             FROM unnest($4::int[], $5::text[], $6::text[]) AS t(u, a, d)`,
            [
                dados.empresaId,
                dados.alteradoPor,
                dados.acao,
                dados.itens.map((i) => i.usuarioAlvo),
                dados.itens.map((i) => JSON.stringify(i.antes)),
                dados.itens.map((i) => JSON.stringify(i.depois)),
            ]
        );
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

    /** Registro interno de quem mudou o quê (fica no banco; não há tela para ele). */
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

    /** Ids dos funcionários de um tipo (ex.: todos os técnicos) da empresa. */
    async idsPorTipo(empresaId: string, tipo: string): Promise<number[]> {
        const { rows } = await pool.query(
            `SELECT id FROM usuarios WHERE empresa_id = $1 AND role = $2 ORDER BY id`,
            [empresaId, tipo]
        );
        return rows.map((r) => r.id);
    }

    /**
     * Trava os funcionários (em ordem de id, pra não dar deadlock entre duas alterações em grupo)
     * e devolve o estado deles. Só volta quem é da empresa informada.
     */
    async travarECarregarVarios(cliente: PoolClient, ids: number[], empresaId: string): Promise<UsuarioPermissoes[]> {
        await cliente.query(
            `SELECT id FROM usuarios WHERE id = ANY($1::int[]) AND empresa_id = $2 ORDER BY id FOR UPDATE`,
            [ids, empresaId]
        );

        const { rows } = await cliente.query(
            `${SELECT_USUARIO_COM_PERMISSOES}
             WHERE u.id = ANY($1::int[]) AND u.empresa_id = $2
             GROUP BY u.id, e.id
             ORDER BY u.id`,
            [ids, empresaId]
        );

        return rows;
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

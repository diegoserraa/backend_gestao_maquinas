import { PoolClient } from "pg";
import { pool } from "../database/connection";

/**
 * Consultas do painel do administrador (dono do sistema): identificação e cobrança das empresas.
 * É o ÚNICO lugar que enxerga várias empresas de propósito — e de propósito NÃO lê dados de
 * operação (máquinas, O.S., quantidade de usuários...): o painel não entra na operação do cliente.
 */

export interface DadosDaEmpresa {
    nome: string;
    razao_social?: string;
    cnpj?: string;
    sem_cnpj: boolean;
    telefone?: string;
    email_cobranca?: string;
    cidade?: string;
    uf?: string;
    plano?: string;
    inicio_contrato?: string;
    observacoes?: string;
}

export interface EmpresaResumo {
    id: string;
    nome: string;
    razao_social: string | null;
    cnpj: string | null;
    sem_cnpj: boolean;
    plano: string | null;
    ativo: boolean;
    criado_em: Date;
    inicio_contrato: string | null;
    telefone: string | null;
    email_cobranca: string | null;
    cidade: string | null;
    uf: string | null;
    inativada_em: Date | null;
    motivo_inativacao: string | null;
    ultimo_acesso: Date | null;
}

export interface GestorDaEmpresa {
    id: number;
    nome: string;
    email: string;
    telefone: string | null;
    ativo: boolean;
    ultimo_acesso: Date | null;
}

const COLUNAS = `
    e.id, e.nome, e.razao_social, e.cnpj, e.sem_cnpj, e.plano, e.ativo, e.criado_em,
    to_char(e.inicio_contrato, 'YYYY-MM-DD') AS inicio_contrato,
    e.telefone, e.email_cobranca, e.cidade, e.uf, e.inativada_em, e.motivo_inativacao,
    (SELECT MAX(u.ultimo_acesso) FROM usuarios u WHERE u.empresa_id = e.id) AS ultimo_acesso
`;

const auditar = (cliente: PoolClient, adminId: number, acao: string, empresaId: string | null, detalhes: object | null) =>
    cliente.query(`INSERT INTO auditoria_admin (admin_id, acao, empresa_id, detalhes) VALUES ($1,$2,$3,$4)`, [
        adminId,
        acao,
        empresaId,
        detalhes ? JSON.stringify(detalhes) : null,
    ]);

async function transacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");
        const resultado = await fn(cliente);
        await cliente.query("COMMIT");
        return resultado;
    } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw erro;
    } finally {
        cliente.release();
    }
}

export class EmpresaAdminRepository {

    async listar(): Promise<EmpresaResumo[]> {
        const { rows } = await pool.query(`SELECT ${COLUNAS} FROM empresas e ORDER BY e.criado_em DESC, e.nome`);
        return rows;
    }

    async buscar(id: string): Promise<(EmpresaResumo & { observacoes: string | null }) | null> {
        const { rows } = await pool.query(`SELECT ${COLUNAS}, e.observacoes FROM empresas e WHERE e.id = $1`, [id]);
        return rows[0] ?? null;
    }

    /** Só quem administra a empresa (gestores): para saber com quem falar. */
    async gestores(id: string): Promise<GestorDaEmpresa[]> {
        const { rows } = await pool.query(
            `SELECT id, nome, email, telefone, ativo, ultimo_acesso
               FROM usuarios WHERE empresa_id = $1 AND role = 'GESTOR' ORDER BY nome`,
            [id]
        );
        return rows;
    }

    async nomeExiste(nome: string, exceto?: string): Promise<boolean> {
        const { rows } = await pool.query(
            `SELECT 1 FROM empresas WHERE lower(nome) = lower($1) AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
            [nome, exceto ?? null]
        );
        return rows.length > 0;
    }

    async cnpjExiste(cnpj: string, exceto?: string): Promise<boolean> {
        const { rows } = await pool.query(`SELECT 1 FROM empresas WHERE cnpj = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`, [cnpj, exceto ?? null]);
        return rows.length > 0;
    }

    async emailExiste(email: string): Promise<boolean> {
        const { rows } = await pool.query(`SELECT 1 FROM usuarios WHERE lower(email) = lower($1) LIMIT 1`, [email]);
        return rows.length > 0;
    }

    /** Empresa + primeiro gestor (com senha temporária) + auditoria, tudo ou nada. */
    async criarComGestor(
        dados: DadosDaEmpresa,
        gestor: { nome: string; email: string; telefone?: string; senhaHash: string },
        adminId: number
    ) {
        return transacao(async (cliente) => {
            const emp = await cliente.query(
                `INSERT INTO empresas (nome, razao_social, cnpj, sem_cnpj, telefone, email_cobranca, cidade, uf, plano, inicio_contrato, observacoes, criada_por)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING id, nome, ativo, criado_em`,
                [
                    dados.nome,
                    dados.razao_social ?? null,
                    dados.cnpj ?? null,
                    dados.sem_cnpj,
                    dados.telefone ?? null,
                    dados.email_cobranca ?? null,
                    dados.cidade ?? null,
                    dados.uf ?? null,
                    dados.plano ?? null,
                    dados.inicio_contrato ?? null,
                    dados.observacoes ?? null,
                    adminId,
                ]
            );
            const empresa = emp.rows[0];

            const usu = await cliente.query(
                `INSERT INTO usuarios (nome, email, senha, role, empresa_id, deve_trocar_senha, telefone)
                 VALUES ($1, $2, $3, 'GESTOR', $4, true, $5)
                 RETURNING id, nome, email, role`,
                [gestor.nome, gestor.email, gestor.senhaHash, empresa.id, gestor.telefone ?? null]
            );

            await auditar(cliente, adminId, "criar_empresa", empresa.id, { nome: dados.nome, cnpj: dados.cnpj ?? null, plano: dados.plano ?? null });

            return { empresa, gestor: usu.rows[0] };
        });
    }

    async atualizarDados(id: string, dados: DadosDaEmpresa, adminId: number): Promise<void> {
        await transacao(async (cliente) => {
            await cliente.query(
                `UPDATE empresas
                    SET nome = $2, razao_social = $3, cnpj = $4, sem_cnpj = $5, telefone = $6, email_cobranca = $7,
                        cidade = $8, uf = $9, plano = $10, inicio_contrato = $11, observacoes = $12
                  WHERE id = $1`,
                [
                    id,
                    dados.nome,
                    dados.razao_social ?? null,
                    dados.cnpj ?? null,
                    dados.sem_cnpj,
                    dados.telefone ?? null,
                    dados.email_cobranca ?? null,
                    dados.cidade ?? null,
                    dados.uf ?? null,
                    dados.plano ?? null,
                    dados.inicio_contrato ?? null,
                    dados.observacoes ?? null,
                ]
            );

            await auditar(cliente, adminId, "editar_empresa", id, { nome: dados.nome, cnpj: dados.cnpj ?? null, plano: dados.plano ?? null });
        });
    }

    async definirSituacao(id: string, ativo: boolean, motivo: string | null, adminId: number): Promise<void> {
        await transacao(async (cliente) => {
            await cliente.query(
                `UPDATE empresas
                    SET ativo = $2,
                        inativada_em = CASE WHEN $2 THEN NULL ELSE now() END,
                        motivo_inativacao = CASE WHEN $2 THEN NULL ELSE $3 END
                  WHERE id = $1`,
                [id, ativo, motivo]
            );

            await auditar(cliente, adminId, ativo ? "reativar_empresa" : "inativar_empresa", id, motivo ? { motivo } : null);
        });
    }

    /** Situação da empresa (usada no login, antes de existir token). */
    async situacao(id: string): Promise<{ ativo: boolean } | null> {
        const { rows } = await pool.query(`SELECT ativo FROM empresas WHERE id = $1`, [id]);
        return rows[0] ?? null;
    }
}

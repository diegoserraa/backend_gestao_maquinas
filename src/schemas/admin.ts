import { z } from "zod";
import { cnpjValido, somenteDigitos } from "../utils/cnpj";
import { semValor } from "./comum";

/**
 * Painel do administrador: cadastro e edição de empresa (dados de identificação e de cobrança) e do
 * primeiro gestor. Nada de dados operacionais aqui.
 */

export const PLANOS = ["BASICO", "PROFISSIONAL", "EMPRESARIAL"] as const;

const UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const texto = (max: number) => z.preprocess(semValor, z.string().trim().max(max).optional());

const telefone = z.preprocess(
    semValor,
    z
        .string()
        .trim()
        .transform(somenteDigitos)
        .refine((d) => d.length >= 10 && d.length <= 13, "Telefone inválido (com DDD)")
        .optional()
);

const dataISO = z.preprocess(
    semValor,
    z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use o formato AAAA-MM-DD)")
        .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Data inválida")
        .optional()
);

const camposDaEmpresa = {
    nome: z.string().trim().min(2, "Informe o nome da empresa").max(120),
    razao_social: texto(160),
    cnpj: z.preprocess(semValor, z.string().trim().max(24).optional()),
    sem_cnpj: z.boolean().optional().default(false),
    telefone,
    email_cobranca: z.preprocess(semValor, z.string().trim().email("E-mail de cobrança inválido").max(254).optional()),
    cidade: texto(80),
    uf: z.preprocess(
        semValor,
        z
            .string()
            .trim()
            .toUpperCase()
            .refine((u) => (UFS as readonly string[]).includes(u), "UF inválida")
            .optional()
    ),
    plano: z.preprocess(semValor, z.enum(PLANOS).optional()),
    inicio_contrato: dataISO,
    observacoes: texto(1000),
};

/** CNPJ válido e obrigatório — ou marcado "sem CNPJ" com uma observação dizendo por quê. */
function regraDoCnpj(dados: { cnpj?: string; sem_cnpj: boolean; observacoes?: string }, ctx: z.RefinementCtx) {
    if (dados.sem_cnpj) {
        if (dados.cnpj) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Não informe o CNPJ em um cliente marcado como 'sem CNPJ'" });
        if (!dados.observacoes || dados.observacoes.length < 5) {
            ctx.addIssue({ code: "custom", path: ["observacoes"], message: "Explique nas observações por que o cliente não tem CNPJ" });
        }
        return;
    }

    if (!dados.cnpj) {
        ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Informe o CNPJ (ou marque 'sem CNPJ')" });
    } else if (!cnpjValido(dados.cnpj)) {
        ctx.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ inválido" });
    }
}

const baseEmpresa = z.object(camposDaEmpresa);

const gestor = z.object({
    nome: z.string().trim().min(2, "Informe o nome do gestor").max(150),
    email: z.string().trim().email("E-mail do gestor inválido").max(254),
    telefone,
});

/** Editar os dados cadastrais de uma empresa que já existe. */
export const empresaEditarSchema = baseEmpresa.superRefine(regraDoCnpj);

/** Cadastrar empresa nova + o primeiro gestor dela. */
export const empresaCriarSchema = baseEmpresa.extend({ gestor }).superRefine(regraDoCnpj);

/** Inativar (com o motivo, opcional) ou reativar uma empresa. */
export const empresaSituacaoSchema = z.object({
    ativo: z.boolean(),
    motivo: z.string().trim().max(500).optional(),
});

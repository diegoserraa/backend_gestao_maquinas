import { z } from "zod";

export const definirPermissoesSchema = z.object({
    // a validação fina (chave existe no catálogo, teto do ator) é do serviço
    permissoes: z.array(z.string().trim().min(1).max(60)).max(200),
});

export const auditoriaQuerySchema = z.object({
    limite: z.coerce.number().int().min(1).max(200).optional(),
    usuario: z.coerce.number().int().positive().optional(),
});

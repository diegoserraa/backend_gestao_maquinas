import { z } from "zod";

export const definirPermissoesSchema = z.object({
    // a validação fina (chave existe no catálogo, teto do ator) é do serviço
    permissoes: z.array(z.string().trim().min(1).max(60)).max(200),
});

// Dar/retirar permissões de vários funcionários: por tipo OU por uma lista de ids.
export const emGrupoSchema = z.object({
    acao: z.enum(["dar", "retirar"]),
    permissoes: z.array(z.string().trim().min(1).max(60)).min(1).max(200),
    alvo: z.union([
        z.object({ tipo: z.enum(["GESTOR", "TECNICO", "OPERADOR"]) }),
        z.object({ usuarios: z.array(z.coerce.number().int().positive().max(2147483647)).min(1).max(500) }),
    ]),
    // true = só mostra o que aconteceria, sem gravar
    simular: z.boolean().optional(),
});

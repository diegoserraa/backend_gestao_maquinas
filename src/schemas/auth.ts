import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().trim().min(1).max(254),
    senha: z.string().min(1).max(200),
});

const role = z.enum(["ADMIN", "GESTOR", "OPERADOR", "TECNICO"]);

export const usuarioCriarSchema = z.object({
    nome: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(254),
    senha: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres").max(200),
    role,
});

export const usuarioAtualizarSchema = z.object({
    nome: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(254),
    role,
    ativo: z.boolean().optional(),
});

import { z } from "zod";

export const trocarSenhaSchema = z.object({
    senha_atual: z.string().min(1, "Informe a senha atual").max(200),
    // o bcrypt só lê os 72 primeiros bytes: acima disso, senhas diferentes virariam a mesma
    nova_senha: z
        .string()
        .min(1, "Informe a nova senha")
        .refine((s) => Buffer.byteLength(s, "utf8") <= 72, "A nova senha pode ter no máximo 72 caracteres"),
});

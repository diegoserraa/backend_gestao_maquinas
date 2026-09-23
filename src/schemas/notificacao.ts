import { z } from "zod";
import { inteiroPositivo, textoOpcional } from "./comum";

export const notificacaoCriarSchema = z.object({
    usuario_id: inteiroPositivo,
    titulo: z.string().trim().min(1).max(150),
    mensagem: z.string().trim().min(1).max(1000),
    tipo: z.string().trim().min(1).max(50),
    url: textoOpcional(300),
});

// o dono da subscription vem do token, não do corpo
export const pushSubscriptionSchema = z.object({
    endpoint: z.string().trim().min(1).max(2000),
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
});

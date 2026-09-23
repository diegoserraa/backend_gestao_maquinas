import { z } from "zod";
import { inteiroOpcional, inteiroPositivo, semValor, textoOpcional } from "./comum";

// vem de multipart (upload da imagem), então tudo chega como texto
export const maquinaSchema = z.object({
    nome: z.string().trim().min(1).max(150),
    modelo: z.string().trim().min(1).max(100),
    fabricante: textoOpcional(100),
    ano: inteiroOpcional(1900, 2100),
    setor_id: inteiroPositivo,
    status: textoOpcional(30),
    intervalo_manutencao_dias: inteiroOpcional(0, 3650),
    ultima_manutencao: z.preprocess(
        semValor,
        z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use o formato AAAA-MM-DD").optional()
    ),
});

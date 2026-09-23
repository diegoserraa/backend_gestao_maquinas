import { z } from "zod";
import { textoOpcional } from "./comum";

export const setorSchema = z.object({
    nome: z.string().trim().min(1).max(100),
    descricao: textoOpcional(500),
});

export const parceiroSchema = z.object({
    nome: z.string().trim().min(1).max(150),
    cnpj: textoOpcional(30),
    telefone: textoOpcional(30),
    email: textoOpcional(254),
    observacoes: textoOpcional(1000),
});

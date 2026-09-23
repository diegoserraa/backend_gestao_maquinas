import { z } from "zod";
import { inteiroOpcional, inteiroPositivoOpcional } from "./comum";

const numeroOuNulo = z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().min(-1_000_000).max(1_000_000).nullable()
);

const parametro = z.object({
    chave: z.string().trim().min(1).max(40),
    unidade: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(20).nullable().optional()),
    minimo: numeroOuNulo,
    atencao: numeroOuNulo,
    alarme: numeroOuNulo,
    janela_seg: inteiroOpcional(0, 86400),
    abrir_os_auto: z.boolean().optional(),
    ativo: z.boolean().optional(),
});

// o controller aceita a lista direto ou dentro de { parametros: [...] }
export const parametrosSchema = z.union([
    z.array(parametro).max(20),
    z.object({ parametros: z.array(parametro).max(20) }),
]);

export const abrirOsAlertaSchema = z.object({
    solicitante_id: inteiroPositivoOpcional,
});

import { z } from "zod";

// formulários e multipart mandam "", "null" ou "undefined" pra "sem valor"
export const semValor = (v: unknown) =>
    v === "" || v === null || v === "null" || v === "undefined" ? undefined : v;

export const textoOpcional = (max: number) =>
    z.preprocess(semValor, z.string().trim().max(max).optional());

export const inteiroPositivo = z.coerce.number().int().positive().max(2147483647);

export const inteiroPositivoOpcional = z.preprocess(semValor, inteiroPositivo.optional());

export const inteiroOpcional = (min: number, max: number) =>
    z.preprocess(semValor, z.coerce.number().int().min(min).max(max).optional());

export const dinheiroOpcional = z.preprocess(
    semValor,
    z.coerce.number().min(0).max(1_000_000_000).optional()
);

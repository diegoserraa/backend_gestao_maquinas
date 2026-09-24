import { z } from "zod";
import { dinheiroOpcional, inteiroPositivo, inteiroPositivoOpcional, semValor, textoOpcional } from "./comum";

const prioridade = z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]);
const tipoManutencao = z.enum(["PREVENTIVA", "CORRETIVA", "PREDITIVA"]);
const dataOpcional = z.preprocess(semValor, z.string().max(40).optional());

export const osCriarSchema = z.object({
    maquina_id: inteiroPositivo,
    descricao: z.string().trim().min(1).max(2000),
    tipo_manutencao: tipoManutencao.optional(),
    prioridade: prioridade.optional(),
    id_tecnico: inteiroPositivoOpcional,
    id_solicitante: inteiroPositivoOpcional,
    resolucao: textoOpcional(2000),
});

// Ou um técnico da empresa, ou "execução externa" (parceiro) — nunca os dois.
// Quem atribuiu vem do token, não do corpo.
export const osAtribuirSchema = z.union([
    z.object({ externo: z.literal(true) }),
    z.object({ id_tecnico: inteiroPositivo }),
]);

export const osFinalizarSchema = z.object({
    resolucao: z.string().trim().min(1, "Resolução é obrigatória").max(2000),
    valor_gasto: dinheiroOpcional,
    id_parceiro: inteiroPositivoOpcional,
    valor_parceiro: dinheiroOpcional,
});

export const osPausarSchema = z.object({
    motivo: z.string().trim().min(1, "Informe o motivo da pausa").max(1000),
});

export const osCancelarSchema = z.object({
    motivo_cancelamento: z.string().trim().min(1, "Motivo é obrigatório").max(1000),
});

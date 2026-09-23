import { z } from "zod";
import { inteiroPositivoOpcional } from "./comum";

export const anexoUploadSchema = z.object({
    origem: z.enum(["MAQUINA", "OS_ABERTURA", "OS_FECHAMENTO"]),
    maquina_id: inteiroPositivoOpcional,
    ordem_servico_id: inteiroPositivoOpcional,
});

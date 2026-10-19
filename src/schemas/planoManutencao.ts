import { z } from "zod";

export const planoManutencaoSchema = z
  .object({
    descricao: z.string().trim().min(1).max(150),
    tipo_gatilho: z.enum(["DIAS", "HORAS"]),
    intervalo_dias: z.number().int().min(1).max(3650).optional(),
    intervalo_horas: z.number().min(0.1).max(100000).optional(),
    // opcional — quando foi feita a última vez (só DIAS); vazio = conta a partir de hoje
    ultima_manutencao: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use o formato AAAA-MM-DD").optional(),
    ativo: z.boolean().optional(),
  })
  .refine((d) => d.tipo_gatilho !== "DIAS" || d.intervalo_dias != null, {
    message: "intervalo_dias é obrigatório quando tipo_gatilho é DIAS",
    path: ["intervalo_dias"],
  })
  .refine((d) => d.tipo_gatilho !== "HORAS" || d.intervalo_horas != null, {
    message: "intervalo_horas é obrigatório quando tipo_gatilho é HORAS",
    path: ["intervalo_horas"],
  });

export const clonarPlanosSchema = z.object({
  maquina_origem_id: z.number().int().positive(),
});

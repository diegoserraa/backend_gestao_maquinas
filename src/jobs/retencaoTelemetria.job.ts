import cron from "node-cron";
import { RetencaoTelemetriaService, lerRetencaoDias } from "../services/RetencaoTelemetriaService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "job-retencao-telemetria" });

const service = new RetencaoTelemetriaService();
const dias = lerRetencaoDias(process.env.TELEMETRIA_RETENCAO_DIAS);

log.info({ dias }, "job de retenção de telemetria carregado");

// todo dia às 03:15 (madrugada, pouco uso)
cron.schedule(
    "15 3 * * *",
    async () => {
        try {
            await service.limparLeituras(dias);
        } catch (error) {
            log.error({ err: error }, "erro na retenção de telemetria");
        }
    },
    { timezone: "America/Sao_Paulo" }
);

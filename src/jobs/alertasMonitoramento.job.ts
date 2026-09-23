import cron from "node-cron";
import { MonitoramentoService } from "../services/MonitoramentoService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "job-sem-sinal" });

const service = new MonitoramentoService();

// minutos sem telemetria até considerar "sem sinal"
const LIMITE_SEM_SINAL_MIN = 5;

log.info("job de alertas de monitoramento carregado");

// a cada 1 minuto: detecta máquinas que pararam de enviar telemetria
cron.schedule(
    "* * * * *",
    async () => {
        try {
            await service.varrerSemSinal(LIMITE_SEM_SINAL_MIN);
        } catch (error) {
            log.error({ err: error }, "erro na varredura de sem-sinal");
        }
    },
    { timezone: "America/Sao_Paulo" }
);

import dotenv from "dotenv";

dotenv.config();

import http from "http";
import { app } from "./app";
import { testConnection } from "./database/testConnection";
import { logger } from "./config/logger";
import "./jobs/manutencaoPreventiva.job";
import "./jobs/alertasMonitoramento.job";

import { initTelemetriaRealtime } from "./realtime/telemetriaRealtime";
import "./mqtt/telemetriaSubscriber";


const PORT = process.env.PORT || 3000;


testConnection();


const server = http.createServer(app);

// WebSocket de telemetria em /ws/telemetria
initTelemetriaRealtime(server);


server.listen(PORT, () => {
    logger.info({ porta: PORT }, "servidor no ar");
});

import { Router } from "express";
import { protegerParamsNumericos } from "../middlewares/validate";
import { exigir } from "../middlewares/permissao";
import { TelemetriaController } from "../controllers/TelemetriaController";

const telemetriaRoutes = Router();
protegerParamsNumericos(telemetriaRoutes);

const telemetriaController = new TelemetriaController();

// toda a telemetria pertence à tela de Monitoramento
telemetriaRoutes.use(exigir("monitoramento.ver"));

telemetriaRoutes.get("/", telemetriaController.listar);
telemetriaRoutes.get("/status", telemetriaController.status);
telemetriaRoutes.get("/:maquinaId", telemetriaController.buscarPorMaquina);
telemetriaRoutes.get("/:maquinaId/historico", telemetriaController.historico);

export { telemetriaRoutes };

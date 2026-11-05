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
// antes de "/:maquinaId": senão "/relatorio" seria lido como um maquinaId literal
telemetriaRoutes.get("/relatorio", telemetriaController.relatorio);
telemetriaRoutes.get("/:maquinaId", telemetriaController.buscarPorMaquina);
telemetriaRoutes.get("/:maquinaId/historico", telemetriaController.historico);
telemetriaRoutes.get("/:maquinaId/historico-agregado", telemetriaController.historicoAgregado);

export { telemetriaRoutes };

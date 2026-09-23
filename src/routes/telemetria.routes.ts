import { Router } from "express";
import { TelemetriaController } from "../controllers/TelemetriaController";

const telemetriaRoutes = Router();

const telemetriaController = new TelemetriaController();

telemetriaRoutes.get("/", telemetriaController.listar);
telemetriaRoutes.get("/status", telemetriaController.status);
telemetriaRoutes.get("/:maquinaId", telemetriaController.buscarPorMaquina);
telemetriaRoutes.get(
    "/:maquinaId/historico",
    telemetriaController.historico
);

export { telemetriaRoutes };

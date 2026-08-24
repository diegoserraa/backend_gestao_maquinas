import { Router } from "express";
import { RelatorioController } from "../controllers/RelatorioController";

const relatorioRoutes = Router();

const relatorioController =
  new RelatorioController();

/* =========================
   HISTÓRICO DE OS
========================= */

relatorioRoutes.get("/ordens-servico", relatorioController.ExportarHistoricoOS);
relatorioRoutes.get("/ordens-servico/preview", relatorioController.previewHistoricoOS)
/* =========================
   INDICADORES POR MÁQUINA
========================= */

relatorioRoutes.get("/manutencao", relatorioController.ExportarIndicadoresMaquinas);
relatorioRoutes.get("/manutencao/preview",relatorioController.previewIndicadoresMaquinas);

export { relatorioRoutes };
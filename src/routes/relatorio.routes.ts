import { Router } from "express";
import { exigir } from "../middlewares/permissao";
import { RelatorioController } from "../controllers/RelatorioController";

const relatorioRoutes = Router();

const relatorioController = new RelatorioController();

/* =========================
   HISTÓRICO DE OS
========================= */
relatorioRoutes.get("/ordens-servico", exigir("relatorios.exportar"), relatorioController.ExportarHistoricoOS);
relatorioRoutes.get("/ordens-servico/preview", exigir("relatorios.ver"), relatorioController.previewHistoricoOS);

/* =========================
   INDICADORES POR MÁQUINA
========================= */
relatorioRoutes.get("/manutencao", exigir("relatorios.exportar"), relatorioController.ExportarIndicadoresMaquinas);
relatorioRoutes.get("/manutencao/preview", exigir("relatorios.ver"), relatorioController.previewIndicadoresMaquinas);

export { relatorioRoutes };

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

/* =========================
   PRODUTIVIDADE POR TÉCNICO
========================= */
relatorioRoutes.get("/tecnicos", exigir("relatorios.exportar"), relatorioController.ExportarProdutividadeTecnico);
relatorioRoutes.get("/tecnicos/preview", exigir("relatorios.ver"), relatorioController.previewProdutividadeTecnico);

/* =========================
   ALERTAS DE MONITORAMENTO
========================= */
relatorioRoutes.get("/alertas", exigir("relatorios.exportar"), relatorioController.ExportarAlertasMonitoramento);
relatorioRoutes.get("/alertas/preview", exigir("relatorios.ver"), relatorioController.previewAlertasMonitoramento);

export { relatorioRoutes };

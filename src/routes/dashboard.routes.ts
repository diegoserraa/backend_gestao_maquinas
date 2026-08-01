import { Router } from "express";
import { DashboardController } from "../controllers/DashboardController";

const dashboardRoutes = Router();

const dashboardController = new DashboardController();


// =========================
// GESTOR
// =========================

dashboardRoutes.get(
    "/gestor/kpis",
    dashboardController.kpis
);

dashboardRoutes.get(
    "/gestor/evolucao",
    dashboardController.evolucao
);

dashboardRoutes.get(
    "/gestor/tempo-medio-resolucao",
    dashboardController.obterTempoMedioResolucao
);

dashboardRoutes.get(
    "/gestor/maquinas-paradas",
    dashboardController.maquinasParadas
);

dashboardRoutes.get(
    "/gestor/tipos-manutencao",
    dashboardController.tiposManutencao
);

dashboardRoutes.get(
    "/gestor/ranking-tecnicos",
    dashboardController.rankingTecnicos
);

dashboardRoutes.get(
    "/gestor/custos",
    dashboardController.custos
);

dashboardRoutes.get(
    "/gestor/alertas",
    dashboardController.alertas
);


// =========================
// TECNICO
// =========================

dashboardRoutes.get(
    "/tecnico/:id/resumo",
    dashboardController.resumoTecnico
);


dashboardRoutes.get(
    "/tecnico/:id/os-abertas",
    dashboardController.osAbertasTecnico
);


dashboardRoutes.get(
    "/tecnico/:id/os-andamento",
    dashboardController.osAndamentoTecnico
);


dashboardRoutes.get(
    "/tecnico/:id/os-finalizadas",
    dashboardController.osFinalizadasTecnico
);


// =========================
// OPERADOR
// =========================

dashboardRoutes.get(
    "/operador/:id/resumo",
    dashboardController.resumoOperador
);


dashboardRoutes.get(
    "/operador/:id/minhas-os",
    dashboardController.minhasOsOperador
);


export {
    dashboardRoutes
};
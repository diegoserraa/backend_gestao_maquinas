import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { DashboardController } from "../controllers/DashboardController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const dashboardRoutes = Router();
protegerParamsNumericos(dashboardRoutes);

const dashboardController = new DashboardController();
const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);


// =========================
// GESTOR
// =========================

dashboardRoutes.get(
    "/gestor/kpis",
    apenasAdminGestor,
    dashboardController.kpis
);

dashboardRoutes.get(
    "/gestor/evolucao",
    apenasAdminGestor,
    dashboardController.evolucao
);

dashboardRoutes.get(
    "/gestor/tempo-medio-resolucao",
    apenasAdminGestor,
    dashboardController.tempoMedioResolucao
);

dashboardRoutes.get(
    "/gestor/maquinas-paradas",
    apenasAdminGestor,
    dashboardController.maquinasParadas
);

dashboardRoutes.get(
    "/gestor/preventivas-vencidas",
    apenasAdminGestor,
    dashboardController.preventivasVencidas
);

dashboardRoutes.get(
    "/gestor/ranking-tecnicos",
    apenasAdminGestor,
    dashboardController.rankingTecnicos
);

dashboardRoutes.get(
    "/gestor/custos",
    apenasAdminGestor,
    dashboardController.custos
);

dashboardRoutes.get(
    "/gestor/alertas",
    apenasAdminGestor,
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
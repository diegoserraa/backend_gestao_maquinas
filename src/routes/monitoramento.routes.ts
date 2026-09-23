import { Router } from "express";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { parametrosSchema, abrirOsAlertaSchema } from "../schemas/monitoramento";
import { MonitoramentoController } from "../controllers/MonitoramentoController";

const monitoramentoRoutes = Router();
protegerParamsNumericos(monitoramentoRoutes);
const c = new MonitoramentoController();

// configurar limites é do gestor; resolver alerta / abrir O.S. também do técnico (operador só consulta)
const apenasGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);
const gestorOuTecnico = roleMiddleware(Role.ADMIN, Role.GESTOR, Role.TECNICO);

monitoramentoRoutes.get("/maquinas/:id/parametros", c.listarParametros);
monitoramentoRoutes.put("/maquinas/:id/parametros", apenasGestor, validarBody(parametrosSchema), c.salvarParametros);
monitoramentoRoutes.delete("/maquinas/:id/parametros/:chave", apenasGestor, c.removerParametro);

monitoramentoRoutes.get("/alertas", c.listarAlertas);
monitoramentoRoutes.get("/pendentes", c.listarPendentes);
monitoramentoRoutes.patch("/alertas/:id/resolver", gestorOuTecnico, c.resolverAlerta);
monitoramentoRoutes.post("/alertas/:id/abrir-os", gestorOuTecnico, validarBody(abrirOsAlertaSchema), c.abrirOS);

export { monitoramentoRoutes };

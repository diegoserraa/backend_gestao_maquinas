import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { parametrosSchema, abrirOsAlertaSchema } from "../schemas/monitoramento";
import { MonitoramentoController } from "../controllers/MonitoramentoController";

const monitoramentoRoutes = Router();
protegerParamsNumericos(monitoramentoRoutes);
const c = new MonitoramentoController();

monitoramentoRoutes.get("/maquinas/:id/parametros", c.listarParametros);
monitoramentoRoutes.put("/maquinas/:id/parametros", validarBody(parametrosSchema), c.salvarParametros);
monitoramentoRoutes.delete("/maquinas/:id/parametros/:chave", c.removerParametro);

monitoramentoRoutes.get("/alertas", c.listarAlertas);
monitoramentoRoutes.get("/pendentes", c.listarPendentes);
monitoramentoRoutes.patch("/alertas/:id/resolver", c.resolverAlerta);
monitoramentoRoutes.post("/alertas/:id/abrir-os", validarBody(abrirOsAlertaSchema), c.abrirOS);

export { monitoramentoRoutes };

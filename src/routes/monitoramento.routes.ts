import { Router } from "express";
import { exigir } from "../middlewares/permissao";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { parametrosSchema, abrirOsAlertaSchema } from "../schemas/monitoramento";
import { MonitoramentoController } from "../controllers/MonitoramentoController";

const monitoramentoRoutes = Router();
protegerParamsNumericos(monitoramentoRoutes);

const c = new MonitoramentoController();

const ver = exigir("monitoramento.ver");

monitoramentoRoutes.get("/maquinas/:id/parametros", ver, c.listarParametros);
monitoramentoRoutes.put("/maquinas/:id/parametros", exigir("monitoramento.configurar_limites"), validarBody(parametrosSchema), c.salvarParametros);
monitoramentoRoutes.delete("/maquinas/:id/parametros/:chave", exigir("monitoramento.configurar_limites"), c.removerParametro);

monitoramentoRoutes.get("/alertas", ver, c.listarAlertas);
monitoramentoRoutes.get("/pendentes", ver, c.listarPendentes);
monitoramentoRoutes.patch("/alertas/:id/resolver", exigir("monitoramento.resolver_alertas"), c.resolverAlerta);
monitoramentoRoutes.post("/alertas/:id/abrir-os", exigir("monitoramento.abrir_os"), validarBody(abrirOsAlertaSchema), c.abrirOS);

export { monitoramentoRoutes };

import { Router } from "express";
import { MonitoramentoController } from "../controllers/MonitoramentoController";

const monitoramentoRoutes = Router();
const c = new MonitoramentoController();

monitoramentoRoutes.get("/maquinas/:id/parametros", c.listarParametros);
monitoramentoRoutes.put("/maquinas/:id/parametros", c.salvarParametros);
monitoramentoRoutes.delete("/maquinas/:id/parametros/:chave", c.removerParametro);

monitoramentoRoutes.get("/alertas", c.listarAlertas);
monitoramentoRoutes.get("/pendentes", c.listarPendentes);
monitoramentoRoutes.patch("/alertas/:id/resolver", c.resolverAlerta);
monitoramentoRoutes.post("/alertas/:id/abrir-os", c.abrirOS);

export { monitoramentoRoutes };

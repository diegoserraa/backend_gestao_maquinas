import { NextFunction, Request, Response, Router } from "express";
import { exigirAdmin } from "../middlewares/permissao";
import { validarBody } from "../middlewares/validate";
import { empresaCriarSchema, empresaEditarSchema, empresaSituacaoSchema } from "../schemas/admin";
import { limitadorDeCriacaoAdmin } from "../middlewares/rateLimitMiddleware";
import { EmpresaAdminController } from "../controllers/EmpresaAdminController";

/**
 * Painel do dono do sistema (administrador). O servidor confere o perfil em TODAS as rotas daqui:
 * gestor, técnico e operador nunca chegam nelas, nem com todas as permissões.
 */
const adminRoutes = Router();
const controller = new EmpresaAdminController();

adminRoutes.use(exigirAdmin);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// o id de empresa é um UUID: qualquer outra coisa nem chega ao banco
adminRoutes.param("id", (_req: Request, res: Response, next: NextFunction, valor: string) =>
    UUID.test(valor) ? next() : res.status(404).json({ error: "Empresa não encontrada" })
);

adminRoutes.get("/empresas", controller.listar);
adminRoutes.get("/empresas/:id", controller.detalhar);
// criar empresa: limite por administrador (um token vazado não cadastra empresas em massa)
adminRoutes.post("/empresas", limitadorDeCriacaoAdmin(), validarBody(empresaCriarSchema), controller.criar);
adminRoutes.patch("/empresas/:id", validarBody(empresaEditarSchema), controller.atualizar);
adminRoutes.patch("/empresas/:id/situacao", validarBody(empresaSituacaoSchema), controller.definirSituacao);

export { adminRoutes };

import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { definirPermissoesSchema, emGrupoSchema } from "../schemas/permissao";
import { PermissaoController } from "../controllers/PermissaoController";

const router = Router();
protegerParamsNumericos(router);

const controller = new PermissaoController();

// qualquer usuário logado: catálogo (rótulos) e as próprias permissões
router.get("/catalogo", controller.catalogo);
router.get("/eu", controller.eu);

// gerenciamento: quem pode e sobre quem é decidido no serviço (permissão + hierarquia + teto)
router.get("/usuarios/:id", controller.consultar);
router.put("/usuarios/:id", validarBody(definirPermissoesSchema), controller.definir);
router.post("/usuarios/:id/restaurar-padrao", controller.restaurarPadrao);

// vários funcionários de uma vez (por tipo ou por seleção)
router.post("/em-grupo", validarBody(emGrupoSchema), controller.emGrupo);

export { router as permissaoRoutes };

import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { usuarioCriarSchema, usuarioAtualizarSchema } from "../schemas/auth";
import { UsuarioController } from "../controllers/UsuarioController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const router = Router();
protegerParamsNumericos(router);
const controller = new UsuarioController();

const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

router.get("/", controller.listar);
router.get("/tecnicos", controller.listarTecnicos);
router.get("/:id", controller.buscarPorId);
router.post("/", apenasAdminGestor, validarBody(usuarioCriarSchema), controller.criar);
router.put("/:id", apenasAdminGestor, validarBody(usuarioAtualizarSchema), controller.atualizar);
router.delete("/:id", apenasAdminGestor, controller.excluir);
router.patch("/:id/toggle-status", apenasAdminGestor, controller.alternarStatus);

export { router as usuarioRoutes };
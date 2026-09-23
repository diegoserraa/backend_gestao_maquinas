import { Router } from "express";
import { UsuarioController } from "../controllers/UsuarioController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const router = Router();
const controller = new UsuarioController();

const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

router.get("/", controller.listar);
router.get("/tecnicos", controller.listarTecnicos);
router.get("/:id", controller.buscarPorId);
router.post("/", apenasAdminGestor, controller.criar);
router.put("/:id", apenasAdminGestor, controller.atualizar);
router.delete("/:id", apenasAdminGestor, controller.excluir);
router.patch("/:id/toggle-status", apenasAdminGestor, controller.alternarStatus);

export { router as usuarioRoutes };
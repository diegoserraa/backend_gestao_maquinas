import { Router } from "express";
import { SetorController } from "../controllers/SetorController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const setorRoutes = Router();

const setorController = new SetorController();
const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

setorRoutes.get("/", setorController.listar);
setorRoutes.get("/:id", setorController.buscarPorId);
setorRoutes.post("/", apenasAdminGestor, setorController.criar);
setorRoutes.put("/:id", apenasAdminGestor, setorController.atualizar);
setorRoutes.delete("/:id", apenasAdminGestor, setorController.excluir);

export { setorRoutes };
import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { setorSchema } from "../schemas/cadastros";
import { SetorController } from "../controllers/SetorController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const setorRoutes = Router();
protegerParamsNumericos(setorRoutes);

const setorController = new SetorController();
const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

setorRoutes.get("/", setorController.listar);
setorRoutes.get("/:id", setorController.buscarPorId);
setorRoutes.post("/", apenasAdminGestor, validarBody(setorSchema), setorController.criar);
setorRoutes.put("/:id", apenasAdminGestor, validarBody(setorSchema), setorController.atualizar);
setorRoutes.delete("/:id", apenasAdminGestor, setorController.excluir);

export { setorRoutes };
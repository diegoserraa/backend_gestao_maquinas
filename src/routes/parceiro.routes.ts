import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { parceiroSchema } from "../schemas/cadastros";
import { ParceiroController } from "../controllers/ParceiroController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const parceiroRoutes = Router();
protegerParamsNumericos(parceiroRoutes);

const parceiroController =
    new ParceiroController();
const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

parceiroRoutes.get("/", parceiroController.listar);
parceiroRoutes.get("/:id",parceiroController.buscarPorId);
parceiroRoutes.post("/", apenasAdminGestor, validarBody(parceiroSchema), parceiroController.criar);
parceiroRoutes.put("/:id", apenasAdminGestor, validarBody(parceiroSchema), parceiroController.atualizar);
parceiroRoutes.delete("/:id", apenasAdminGestor, parceiroController.excluir);

export { parceiroRoutes };
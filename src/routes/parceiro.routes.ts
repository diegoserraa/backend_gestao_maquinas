import { Router } from "express";
import { ParceiroController } from "../controllers/ParceiroController";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { Role } from "../enums/Role";

const parceiroRoutes = Router();

const parceiroController =
    new ParceiroController();
const apenasAdminGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

parceiroRoutes.get("/", parceiroController.listar);
parceiroRoutes.get("/:id",parceiroController.buscarPorId);
parceiroRoutes.post("/", apenasAdminGestor, parceiroController.criar);
parceiroRoutes.put("/:id", apenasAdminGestor, parceiroController.atualizar);
parceiroRoutes.delete("/:id", apenasAdminGestor, parceiroController.excluir);

export { parceiroRoutes };
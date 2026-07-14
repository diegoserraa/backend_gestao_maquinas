import { Router } from "express";
import { SetorController } from "../controllers/SetorController";

const setorRoutes = Router();

const setorController = new SetorController();

setorRoutes.get("/", setorController.listar);
setorRoutes.get("/:id", setorController.buscarPorId);
setorRoutes.post("/", setorController.criar);
setorRoutes.put("/:id", setorController.atualizar);
setorRoutes.delete("/:id", setorController.excluir);

export { setorRoutes };
import { Router } from "express";
import { ParceiroController } from "../controllers/ParceiroController";

const parceiroRoutes = Router();

const parceiroController =
    new ParceiroController();

parceiroRoutes.get("/", parceiroController.listar);
parceiroRoutes.get("/:id",parceiroController.buscarPorId);
parceiroRoutes.post("/",parceiroController.criar);
parceiroRoutes.put("/:id",parceiroController.atualizar);
parceiroRoutes.delete("/:id", parceiroController.excluir);

export { parceiroRoutes };
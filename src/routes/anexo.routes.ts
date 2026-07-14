import { Router } from "express";
import { AnexoController } from "../controllers/AnexoController";
import { upload } from "../middlewares/uploadMiddleware";

const anexoRoutes = Router();

const controller =
    new AnexoController();

anexoRoutes.get(
    "/:id",
    controller.buscarPorId
);

anexoRoutes.get(
    "/maquina/:id",
    controller.listarPorMaquina
);

anexoRoutes.get(
    "/os/:id",
    controller.listarPorOS
);

anexoRoutes.post(
    "/upload",
    upload.single("arquivo"),
    controller.upload
);

anexoRoutes.delete(
    "/:id",
    controller.excluir
);

export {
    anexoRoutes
};
import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { anexoUploadSchema } from "../schemas/anexo";
import { AnexoController } from "../controllers/AnexoController";
import { upload } from "../middlewares/uploadMiddleware";

const anexoRoutes = Router();
protegerParamsNumericos(anexoRoutes);

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
    validarBody(anexoUploadSchema),
    controller.upload
);

anexoRoutes.delete(
    "/:id",
    controller.excluir
);

export {
    anexoRoutes
};
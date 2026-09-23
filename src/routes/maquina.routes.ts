import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { maquinaSchema } from "../schemas/maquina";
import { MaquinaController } from "../controllers/MaquinaController";
import { upload } from "../middlewares/uploadMiddleware";
const maquinaRoutes = Router();
protegerParamsNumericos(maquinaRoutes);

const maquinaController =
    new MaquinaController();

maquinaRoutes.get("/",maquinaController.listar);
maquinaRoutes.get("/:id", maquinaController.buscarPorId);
maquinaRoutes.post("/", upload.single("imagem"), validarBody(maquinaSchema), maquinaController.criar);
maquinaRoutes.put("/:id", upload.single("imagem"), validarBody(maquinaSchema), maquinaController.atualizar);
maquinaRoutes.delete("/:id", maquinaController.excluir);
maquinaRoutes.patch("/:id/status", maquinaController.alternarStatus);
maquinaRoutes.get("/:id/os", maquinaController.listarOsPorMaquina);

export { maquinaRoutes };
import { Router } from "express";
import { MaquinaController } from "../controllers/MaquinaController";
import { upload } from "../middlewares/uploadMiddleware";
const maquinaRoutes = Router();

const maquinaController =
    new MaquinaController();

maquinaRoutes.get("/",maquinaController.listar);
maquinaRoutes.get("/:id", maquinaController.buscarPorId);
maquinaRoutes.post("/", upload.single("imagem"), maquinaController.criar);
maquinaRoutes.put("/:id", upload.single("imagem"), maquinaController.atualizar);
maquinaRoutes.delete("/:id", maquinaController.excluir);
maquinaRoutes.patch("/:id/status", maquinaController.alternarStatus);
maquinaRoutes.get("/:id/os", maquinaController.listarOsPorMaquina);

export { maquinaRoutes };
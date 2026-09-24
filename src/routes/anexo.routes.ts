import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { exigir } from "../middlewares/permissao";
import { anexoUploadSchema } from "../schemas/anexo";
import { AnexoController } from "../controllers/AnexoController";
import { upload } from "../middlewares/uploadMiddleware";

const anexoRoutes = Router();
protegerParamsNumericos(anexoRoutes);

const controller = new AnexoController();

anexoRoutes.get("/:id", exigir("anexos.ver"), controller.buscarPorId);
anexoRoutes.get("/maquina/:id", exigir("anexos.ver"), controller.listarPorMaquina);
anexoRoutes.get("/os/:id", exigir("anexos.ver"), controller.listarPorOS);

// a permissão vem ANTES do upload: quem não pode não chega a enviar arquivo
anexoRoutes.post("/upload", exigir("anexos.enviar"), upload.single("arquivo"), validarBody(anexoUploadSchema), controller.upload);
anexoRoutes.delete("/:id", exigir("anexos.excluir"), controller.excluir);

export { anexoRoutes };

import { Router } from "express";
import { UsuarioController } from "../controllers/UsuarioController";

const router = Router();
const controller = new UsuarioController();

router.get("/", controller.listar);
router.get("/tecnicos", controller.listarTecnicos);
router.get("/:id", controller.buscarPorId);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.excluir);
router.patch("/:id/toggle-status", controller.alternarStatus);

export { router as usuarioRoutes };
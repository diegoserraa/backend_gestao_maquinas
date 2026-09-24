import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { exigir, exigirQualquer } from "../middlewares/permissao";
import { LEITURA_DE_APOIO } from "../permissoes/catalogo";
import { parceiroSchema } from "../schemas/cadastros";
import { ParceiroController } from "../controllers/ParceiroController";

const parceiroRoutes = Router();
protegerParamsNumericos(parceiroRoutes);

const parceiroController = new ParceiroController();

// parceiros aparecem ao finalizar uma O.S. externa e nos relatórios: leitura de apoio
const lerParceiros = exigirQualquer(LEITURA_DE_APOIO.parceiros);

parceiroRoutes.get("/", lerParceiros, parceiroController.listar);
parceiroRoutes.get("/:id", lerParceiros, parceiroController.buscarPorId);
parceiroRoutes.post("/", exigir("parceiros.criar"), validarBody(parceiroSchema), parceiroController.criar);
parceiroRoutes.put("/:id", exigir("parceiros.editar"), validarBody(parceiroSchema), parceiroController.atualizar);
parceiroRoutes.delete("/:id", exigir("parceiros.excluir"), parceiroController.excluir);

export { parceiroRoutes };

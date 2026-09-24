import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { exigir, exigirQualquer } from "../middlewares/permissao";
import { LEITURA_DE_APOIO } from "../permissoes/catalogo";
import { setorSchema } from "../schemas/cadastros";
import { SetorController } from "../controllers/SetorController";

const setorRoutes = Router();
protegerParamsNumericos(setorRoutes);

const setorController = new SetorController();

// setores aparecem nos formulários de máquina e nos filtros de relatório: leitura de apoio
const lerSetores = exigirQualquer(LEITURA_DE_APOIO.setores);

setorRoutes.get("/", lerSetores, setorController.listar);
setorRoutes.get("/:id", lerSetores, setorController.buscarPorId);
setorRoutes.post("/", exigir("setores.criar"), validarBody(setorSchema), setorController.criar);
setorRoutes.put("/:id", exigir("setores.editar"), validarBody(setorSchema), setorController.atualizar);
setorRoutes.delete("/:id", exigir("setores.excluir"), setorController.excluir);

export { setorRoutes };

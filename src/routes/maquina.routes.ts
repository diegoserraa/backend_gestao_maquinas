import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { exigir, exigirQualquer } from "../middlewares/permissao";
import { LEITURA_DE_APOIO } from "../permissoes/catalogo";
import { maquinaSchema } from "../schemas/maquina";
import { MaquinaController } from "../controllers/MaquinaController";
import { upload } from "../middlewares/uploadMiddleware";

const maquinaRoutes = Router();
protegerParamsNumericos(maquinaRoutes);

const maquinaController = new MaquinaController();

// a lista de máquinas alimenta outras telas (O.S., relatórios, monitoramento): leitura de apoio
const lerMaquinas = exigirQualquer(LEITURA_DE_APOIO.maquinas);

maquinaRoutes.get("/", lerMaquinas, maquinaController.listar);
// etiquetas para imprimir (antes de "/:id"): quem cadastra máquinas é quem imprime os QR Codes
maquinaRoutes.get("/etiquetas", exigir("maquinas.criar"), maquinaController.etiquetas);
maquinaRoutes.get("/:id", lerMaquinas, maquinaController.buscarPorId);

// a permissão vem ANTES do upload: quem não pode não chega a enviar arquivo
maquinaRoutes.post("/", exigir("maquinas.criar"), upload.single("imagem"), validarBody(maquinaSchema), maquinaController.criar);
maquinaRoutes.put("/:id", exigir("maquinas.editar"), upload.single("imagem"), validarBody(maquinaSchema), maquinaController.atualizar);
maquinaRoutes.delete("/:id", exigir("maquinas.excluir"), maquinaController.excluir);
maquinaRoutes.patch("/:id/status", exigir("maquinas.alterar_status"), maquinaController.alternarStatus);

// O.S. da máquina: devolve só as que o usuário pode ver (o controller aplica o escopo)
maquinaRoutes.get("/:id/os", exigir("maquinas.ver"), maquinaController.listarOsPorMaquina);

export { maquinaRoutes };

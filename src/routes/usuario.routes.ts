import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { exigir, exigirQualquer } from "../middlewares/permissao";
import { LEITURA_DE_APOIO } from "../permissoes/catalogo";
import { usuarioCriarSchema, usuarioAtualizarSchema } from "../schemas/auth";
import { UsuarioController } from "../controllers/UsuarioController";

const router = Router();
protegerParamsNumericos(router);

const controller = new UsuarioController();

router.get("/", exigir("usuarios.ver"), controller.listar);
// lista de técnicos: quem atribui O.S. precisa dela mesmo sem acessar a tela de usuários
router.get("/tecnicos", exigirQualquer(LEITURA_DE_APOIO.tecnicos), controller.listarTecnicos);
router.get("/:id", exigir("usuarios.ver"), controller.buscarPorId);
router.post("/", exigir("usuarios.criar"), validarBody(usuarioCriarSchema), controller.criar);
router.put("/:id", exigir("usuarios.editar"), validarBody(usuarioAtualizarSchema), controller.atualizar);
router.delete("/:id", exigir("usuarios.excluir"), controller.excluir);
router.patch("/:id/toggle-status", exigir("usuarios.alterar_status"), controller.alternarStatus);

export { router as usuarioRoutes };

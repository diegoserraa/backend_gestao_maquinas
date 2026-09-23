import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { notificacaoCriarSchema } from "../schemas/notificacao";
import { NotificacaoController } from "../controllers/NotificacaoController";


const notificacaoRoutes = Router();
protegerParamsNumericos(notificacaoRoutes);

const controller =
    new NotificacaoController();



notificacaoRoutes.get("/",controller.listar);
notificacaoRoutes.get("/nao-lidas",controller.naoLidas);
notificacaoRoutes.get("/contador",controller.contador);
notificacaoRoutes.post("/", validarBody(notificacaoCriarSchema), controller.criar);
notificacaoRoutes.patch("/:id/lida", controller.marcarComoLida);
notificacaoRoutes.patch("/marcar-todas",controller.marcarTodas);
notificacaoRoutes.delete("/:id",controller.excluir);



export {
    notificacaoRoutes
};
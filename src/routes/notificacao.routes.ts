import { Router } from "express";
import { NotificacaoController } from "../controllers/NotificacaoController";


const notificacaoRoutes = Router();

const controller =
    new NotificacaoController();



notificacaoRoutes.get("/",controller.listar);
notificacaoRoutes.get("/nao-lidas",controller.naoLidas);
notificacaoRoutes.get("/contador",controller.contador);
notificacaoRoutes.post("/",controller.criar);
notificacaoRoutes.patch("/:id/lida", controller.marcarComoLida);
notificacaoRoutes.patch("/marcar-todas",controller.marcarTodas);
notificacaoRoutes.delete("/:id",controller.excluir);



export {
    notificacaoRoutes
};
import { Router } from "express";

import { PushSubscriptionController }
from "../controllers/PushSubscriptionController";

const pushSubscriptionRoutes =
    Router();

const controller =
    new PushSubscriptionController();

pushSubscriptionRoutes.post("/",controller.criar);
pushSubscriptionRoutes.get("/usuario/:usuario_id",controller.listarPorUsuario);
pushSubscriptionRoutes.delete("/:id", controller.excluir);

export {
    pushSubscriptionRoutes
};
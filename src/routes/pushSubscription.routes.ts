import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { pushSubscriptionSchema } from "../schemas/notificacao";

import { PushSubscriptionController }
from "../controllers/PushSubscriptionController";

const pushSubscriptionRoutes =
    Router();

protegerParamsNumericos(pushSubscriptionRoutes);

const controller =
    new PushSubscriptionController();

pushSubscriptionRoutes.post("/", validarBody(pushSubscriptionSchema), controller.criar);
pushSubscriptionRoutes.get("/usuario/:usuario_id",controller.listarPorUsuario);
pushSubscriptionRoutes.delete("/:id", controller.excluir);

export {
    pushSubscriptionRoutes
};
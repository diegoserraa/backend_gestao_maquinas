import { Request, Response } from "express";
import { PushSubscriptionService } from "../services/PushSubscriptionService";

export class PushSubscriptionController {

    private service =
        new PushSubscriptionService();

    criar = async (
        req: Request,
        res: Response
    ) => {

        const subscription =
            await this.service.criar(req.body);

        return res.status(201).json(subscription);
    };

    listarPorUsuario = async (
        req: Request,
        res: Response
    ) => {

        // ignora req.params.usuario_id: só a própria lista, vinda do token
        const subscriptions =
            await this.service.listarPorUsuario(
                req.user!.id
            );

        return res.json(subscriptions);
    };

    excluir = async (
        req: Request,
        res: Response
    ) => {

        const id =
            Number(req.params.id);

        await this.service.excluir(id, req.user!.id);

        return res.sendStatus(204);
    };
}
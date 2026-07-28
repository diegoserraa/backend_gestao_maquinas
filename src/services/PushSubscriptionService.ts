import { IPushSubscription } from "../interfaces/IPushSubscription";
import { PushSubscriptionRepository } from "../repositories/PushSubscriptionRepository";

export class PushSubscriptionService {

    private repository =
        new PushSubscriptionRepository();

    async criar(
        subscription: IPushSubscription
    ) {
        return this.repository.criar(subscription);
    }

    async listarPorUsuario(
        usuario_id: number
    ) {
        return this.repository.listarPorUsuario(usuario_id);
    }

    async excluir(
        id: number
    ) {
        await this.repository.excluir(id);
    }
}
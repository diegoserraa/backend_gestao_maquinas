import { NotificacaoRepository } from "../repositories/NotificacaoRepository";
import { INotificacao } from "../interfaces/Inotificacao";
import { Pagina } from "../utils/paginacao";
import { enviarParaUsuario } from "../realtime/wsBus";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "notificacao-tempo-real" });

export class NotificacaoService {

    private repository =
        new NotificacaoRepository();

    /**
     * Empurra o evento para as abas/aparelhos do dono da notificação. Roda em SEGUNDO PLANO: quem
     * criou/leu a notificação não espera a contagem nem o envio (abrir uma O.S. notifica a empresa
     * toda, e cada espera a mais somaria na resposta). Nunca derruba a operação principal: se o tempo
     * real falhar, a notificação continua gravada (e aparece ao recarregar).
     */
    private async emitir(
        usuarioId: number,
        empresaId: string | undefined,
        type: "notificacao" | "notificacao_sync",
        montar: (naoLidas: number) => unknown
    ): Promise<void> {
        if (!empresaId) return;

        try {
            const naoLidas = await this.repository.contarNaoLidas(usuarioId);
            enviarParaUsuario(usuarioId, empresaId, type, montar(naoLidas));
        } catch (erro) {
            log.warn({ err: erro, usuarioId }, "não foi possível enviar a notificação em tempo real");
        }
    }

    async criar(
        notificacao: INotificacao
    ) {
        const criada = await this.repository.criar(notificacao) as INotificacao & { empresa_id?: string };

        // em tempo real: o sino do destinatário atualiza na hora (sem esperar o próximo "polling")
        void this.emitir(criada.usuario_id, criada.empresa_id, "notificacao", (naoLidas) => ({
            notificacao: criada,
            nao_lidas: naoLidas,
        }));

        return criada;
    }

    async listarPorUsuario(
        usuario_id: number,
        pagina: Pagina
    ) {
        return this.repository.listarPorUsuario(usuario_id, pagina);
    }

    async listarNaoLidas(
        usuario_id: number,
        pagina: Pagina
    ) {
        return this.repository.listarNaoLidas(usuario_id, pagina);
    }

    async contarNaoLidas(
        usuario_id: number
    ) {
        return this.repository.contarNaoLidas(usuario_id);
    }

    async marcarComoLida(
        id: number,
        usuarioId: number,
        empresaId?: string
    ) {
        await this.repository.marcarComoLida(id, usuarioId);
        // outras abas/aparelhos do mesmo usuário acompanham
        void this.emitir(usuarioId, empresaId, "notificacao_sync", (n) => ({ acao: "lida", id, nao_lidas: n }));
    }

    async marcarTodasComoLidas(
        usuario_id: number,
        empresaId?: string
    ) {
        await this.repository.marcarTodasComoLidas(usuario_id);
        void this.emitir(usuario_id, empresaId, "notificacao_sync", (n) => ({ acao: "todas_lidas", nao_lidas: n }));
    }

    async excluir(
        id: number,
        usuarioId: number,
        empresaId?: string
    ) {
        await this.repository.excluir(id, usuarioId);
        void this.emitir(usuarioId, empresaId, "notificacao_sync", (n) => ({ acao: "excluida", id, nao_lidas: n }));
    }

}

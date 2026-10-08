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
     * Empurra o evento para as abas/aparelhos do dono da notificação.
     *
     * SEMPRE aguardado pelo chamador (nunca "void"): a contagem de não lidas
     * é calculada AQUI DENTRO, então se duas chamadas (ex.: marcar uma como
     * lida e, em seguida, marcar todas) não respeitarem essa ordem, a
     * contagem de uma pode ler o estado já alterado pela outra e mandar um
     * número errado pro cliente — foi exatamente o bug achado (teste
     * "sincroniza as outras abas com o contador certo" falhava de forma
     * intermitente). O envio em si (enviarParaUsuario) já é síncrono/não-
     * bloqueante por natureza; o único custo de aguardar aqui é a consulta
     * de contagem, rápida (índice), e vale a correção.
     *
     * Nunca derruba a operação principal: se o tempo real falhar, a
     * notificação continua gravada (e aparece ao recarregar).
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
        await this.emitir(criada.usuario_id, criada.empresa_id, "notificacao", (naoLidas) => ({
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
        await this.emitir(usuarioId, empresaId, "notificacao_sync", (n) => ({ acao: "lida", id, nao_lidas: n }));
    }

    async marcarTodasComoLidas(
        usuario_id: number,
        empresaId?: string
    ) {
        await this.repository.marcarTodasComoLidas(usuario_id);
        await this.emitir(usuario_id, empresaId, "notificacao_sync", (n) => ({ acao: "todas_lidas", nao_lidas: n }));
    }

    async excluir(
        id: number,
        usuarioId: number,
        empresaId?: string
    ) {
        await this.repository.excluir(id, usuarioId);
        await this.emitir(usuarioId, empresaId, "notificacao_sync", (n) => ({ acao: "excluida", id, nao_lidas: n }));
    }

}

import { NotificacaoRepository } from "../repositories/NotificacaoRepository";
import { INotificacao } from "../interfaces/Inotificacao";


export class NotificacaoService {


    private repository =
        new NotificacaoRepository();



    async criar(
        notificacao:INotificacao
    ){

        return this.repository.criar(
            notificacao
        );

    }



    async listarPorUsuario(
        usuario_id:number
    ){

        return this.repository.listarPorUsuario(
            usuario_id
        );

    }



    async listarNaoLidas(
        usuario_id:number
    ){

        return this.repository.listarNaoLidas(
            usuario_id
        );

    }




    async contarNaoLidas(
        usuario_id:number
    ){

        return this.repository.contarNaoLidas(
            usuario_id
        );

    }



    async marcarComoLida(
        id:number,
        usuarioId:number
    ){

        return this.repository.marcarComoLida(
            id,
            usuarioId
        );

    }



    async marcarTodasComoLidas(
        usuario_id:number
    ){

        return this.repository.marcarTodasComoLidas(
            usuario_id
        );

    }



    async excluir(
        id:number,
        usuarioId:number
    ){

        return this.repository.excluir(
            id,
            usuarioId
        );

    }

}
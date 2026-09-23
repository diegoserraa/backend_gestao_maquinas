import { Request, Response } from "express";
import { NotificacaoService } from "../services/NotificacaoService";


export class NotificacaoController {


    private service =
        new NotificacaoService();



    listar = async (
        req:Request,
        res:Response
    )=>{

        // usuario_id vem sempre do token, nunca de query/body — antes
        // qualquer usuário logado podia ler notificações de outro só
        // trocando esse parâmetro na requisição.
        const usuario_id = req.user!.id;


        const notificacoes =
            await this.service.listarPorUsuario(
                usuario_id
            );


        return res.json(notificacoes);

    };




    naoLidas = async (
        req:Request,
        res:Response
    )=>{


        const usuario_id = req.user!.id;


        const notificacoes =
            await this.service.listarNaoLidas(
                usuario_id
            );


        return res.json(notificacoes);

    };




    contador = async (
        req:Request,
        res:Response
    )=>{


        const usuario_id = req.user!.id;


        const total =
            await this.service.contarNaoLidas(
                usuario_id
            );


        return res.json({
            total
        });

    };




    criar = async (
        req:Request,
        res:Response
    )=>{


        const notificacao =
            await this.service.criar(
                req.body
            );


        return res.status(201)
            .json(notificacao);

    };




    marcarComoLida = async (
        req:Request,
        res:Response
    )=>{


        const id =
            Number(req.params.id);


        await this.service.marcarComoLida(
            id,
            req.user!.id
        );


        return res.sendStatus(204);

    };




    marcarTodas = async (
        req:Request,
        res:Response
    )=>{


        const usuario_id = req.user!.id;


        await this.service.marcarTodasComoLidas(
            usuario_id
        );


        return res.sendStatus(204);

    };




    excluir = async (
        req:Request,
        res:Response
    )=>{


        const id =
            Number(req.params.id);


        await this.service.excluir(
            id,
            req.user!.id
        );


        return res.sendStatus(204);

    };

}
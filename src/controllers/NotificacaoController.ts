import { Request, Response } from "express";
import { NotificacaoService } from "../services/NotificacaoService";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { lerPagina, responderPagina } from "../utils/paginacao";


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


        const { itens, total } =
            await this.service.listarPorUsuario(
                usuario_id,
                lerPagina(req, { padrao: 100, maximo: 200 })
            );


        return responderPagina(res, itens, total);

    };




    naoLidas = async (
        req:Request,
        res:Response
    )=>{


        const usuario_id = req.user!.id;


        const { itens, total } =
            await this.service.listarNaoLidas(
                usuario_id,
                lerPagina(req, { padrao: 100, maximo: 200 })
            );


        return responderPagina(res, itens, total);

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

        // o destinatário precisa ser da mesma empresa de quem envia
        const destinatario =
            await new UsuarioRepository().buscarPorId(
                req.body.usuario_id,
                req.empresaId!
            );

        if(!destinatario){
            return res.status(400).json({
                message: "Usuário não encontrado"
            });
        }

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
            req.user!.id,
            req.empresaId
        );


        return res.sendStatus(204);

    };




    marcarTodas = async (
        req:Request,
        res:Response
    )=>{


        const usuario_id = req.user!.id;


        await this.service.marcarTodasComoLidas(
            usuario_id,
            req.empresaId
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
            req.user!.id,
            req.empresaId
        );


        return res.sendStatus(204);

    };

}
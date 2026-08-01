import { Request, Response } from "express";

import { OrdemServicoService } from "../services/OrdemServicoService";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";

import { NotificacaoSistemaService } from "../services/notificacaoSistemaService";
import { NotificacaoService } from "../services/NotificacaoService";
import { PushNotificationService } from "../services/PushNotificationService";
import { MaquinaRepository } from "../repositories/MaquinaRepository";


const ordemServicoRepository =
  new OrdemServicoRepository();

const usuarioRepository =
  new UsuarioRepository();
  const maquinaRepository =
  new MaquinaRepository();


const notificacaoSistemaService =
  new NotificacaoSistemaService(
    new NotificacaoService(),
    new PushNotificationService()
  );


const ordemServicoService =
  new OrdemServicoService(
    ordemServicoRepository,
    usuarioRepository,
    notificacaoSistemaService,
    maquinaRepository
  );


export class OrdemServicoController {

  private service = ordemServicoService;


  listar = async (req: Request, res: Response) => {

    const osList =
      await this.service.listar();

    return res.json(osList);

  };


  buscarPorId = async (req: Request, res: Response) => {

    const os =
      await this.service.buscarPorId(
        Number(req.params.id)
      );

    return res.json(os);

  };


  criar = async (req: Request, res: Response) => {

    const os =
      await this.service.criar(
        req.body
      );

    return res
      .status(201)
      .json(os);

  };


  atualizar = async (req: Request, res: Response) => {

    const os =
      await this.service.atualizar(
        Number(req.params.id),
        req.body
      );

    return res.json(os);

  };


  excluir = async (req: Request, res: Response) => {

    await this.service.excluir(
      Number(req.params.id)
    );

    return res.sendStatus(204);

  };


  atribuir = async (req: Request, res: Response) => {

    const {
      id_tecnico,
      id_atribuido_por
    } = req.body;


    if(!id_tecnico || !id_atribuido_por){

      return res.status(400).json({
        error:
        "id_tecnico e id_atribuido_por são obrigatórios"
      });

    }


    const os =
      await this.service.atribuir(
        Number(req.params.id),
        Number(id_tecnico),
        Number(id_atribuido_por)
      );


    return res.json(os);

  };


  iniciar = async (req: Request, res: Response) => {

    const os =
      await this.service.iniciar(
        Number(req.params.id)
      );

    return res.json(os);

  };


finalizar = async (req: Request, res: Response) => {

    const {
      resolucao,
      valor_gasto,
      id_parceiro,
      valor_parceiro
    } = req.body;


    const os =
      await this.service.finalizar(
        Number(req.params.id),
        resolucao,
        valor_gasto,
        id_parceiro,
        valor_parceiro
      );


    return res.json(os);

}; 


  cancelar = async (req: Request, res: Response) => {

    const {
      motivo_cancelamento
    } = req.body;


    const os =
      await this.service.cancelar(
        Number(req.params.id),
        motivo_cancelamento
      );


    return res.json(os);

  };


  pausar = async (req: Request, res: Response) => {

    const {
      motivo
    } = req.body;


    const os =
      await this.service.pausar(
        Number(req.params.id),
        motivo
      );


    return res.json(os);

  };


  alterarPrioridade = async (req: Request, res: Response) => {

    const {
      prioridade
    } = req.body;


    const os =
      await this.service.alterarPrioridade(
        Number(req.params.id),
        prioridade
      );


    return res.json(os);

  };

}
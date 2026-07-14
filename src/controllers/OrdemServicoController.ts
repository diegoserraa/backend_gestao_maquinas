import { Request, Response } from "express";
import { OrdemServicoService } from "../services/OrdemServicoService";

export class OrdemServicoController {

  private service = new OrdemServicoService();

  // ─── CRUD base ────────────────────────────────────────────
  listar = async (req: Request, res: Response) => {
    const osList = await this.service.listar();
    return res.json(osList);
  };

  buscarPorId = async (req: Request, res: Response) => {
    const os = await this.service.buscarPorId(Number(req.params.id));
    return res.json(os);
  };

  criar = async (req: Request, res: Response) => {
    const os = await this.service.criar(req.body);
    return res.status(201).json(os);
  };

  atualizar = async (req: Request, res: Response) => {
    const os = await this.service.atualizar(Number(req.params.id), req.body);
    return res.json(os);
  };

  excluir = async (req: Request, res: Response) => {
    await this.service.excluir(Number(req.params.id));
    return res.sendStatus(204);
  };

  // ─── patches semânticos ───────────────────────────────────

  /**
   * PATCH /:id/atribuir
   * Body: { id_tecnico, id_atribuido_por }
   * Técnico se auto-atribui → id_atribuido_por == id_tecnico
   * Gestor atribui          → id_atribuido_por != id_tecnico
   */
  atribuir = async (req: Request, res: Response) => {
    const { id_tecnico, id_atribuido_por } = req.body;

    if (!id_tecnico || !id_atribuido_por) {
      return res.status(400).json({ error: "id_tecnico e id_atribuido_por são obrigatórios" });
    }

    const os = await this.service.atribuir(
      Number(req.params.id),
      Number(id_tecnico),
      Number(id_atribuido_por)
    );
    return res.json(os);
  };

  /**
   * PATCH /:id/iniciar
   * Técnico inicia o atendimento → EM_ANDAMENTO
   */
  iniciar = async (req: Request, res: Response) => {
    const os = await this.service.iniciar(Number(req.params.id));
    return res.json(os);
  };

  /**
   * PATCH /:id/finalizar
   * Body: { resolucao, valor_gasto }
   */
  finalizar = async (req: Request, res: Response) => {
    const { resolucao, valor_gasto } = req.body;
    const os = await this.service.finalizar(Number(req.params.id), resolucao, valor_gasto);
    return res.json(os);
  };

  /**
   * PATCH /:id/cancelar
   * Body: { motivo_cancelamento }
   */
  cancelar = async (req: Request, res: Response) => {
    const { motivo_cancelamento } = req.body;
    const os = await this.service.cancelar(Number(req.params.id), motivo_cancelamento);
    return res.json(os);
  };

  /**
   * PATCH /:id/pausar
   * Body: { motivo }
   */
  pausar = async (req: Request, res: Response) => {
    const { motivo } = req.body;
    const os = await this.service.pausar(Number(req.params.id), motivo);
    return res.json(os);
  };

  /**
   * PATCH /:id/prioridade
   * Body: { prioridade }
   */
  alterarPrioridade = async (req: Request, res: Response) => {
    const { prioridade } = req.body;
    const os = await this.service.alterarPrioridade(Number(req.params.id), prioridade);
    return res.json(os);
  };
}

import { Request, Response } from "express";
import { MonitoramentoService } from "../services/MonitoramentoService";

export class MonitoramentoController {

    private service = new MonitoramentoService();

    // GET /monitoramento/maquinas/:id/parametros
    listarParametros = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0)
                return res.status(400).json({ message: "id inválido" });
            return res.json(await this.service.listarParametros(id, req.empresaId!));
        } catch (e: any) {
            return res.status(500).json({ message: e.message || "Erro ao listar parâmetros" });
        }
    };

    // PUT /monitoramento/maquinas/:id/parametros   body: IMaquinaParametro[]
    salvarParametros = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0)
                return res.status(400).json({ message: "id inválido" });

            const lista = Array.isArray(req.body) ? req.body : req.body?.parametros;
            if (!Array.isArray(lista))
                return res.status(400).json({ message: "envie uma lista de parâmetros" });

            return res.json(await this.service.salvarParametros(id, lista, req.empresaId!));
        } catch (e: any) {
            return res.status(400).json({ message: e.message || "Erro ao salvar parâmetros" });
        }
    };

    // DELETE /monitoramento/maquinas/:id/parametros/:chave
    removerParametro = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            await this.service.removerParametro(id, String(req.params.chave), req.empresaId!);
            return res.sendStatus(204);
        } catch (e: any) {
            return res.status(400).json({ message: e.message || "Erro ao remover" });
        }
    };

    // GET /monitoramento/alertas?status=aberto
    listarAlertas = async (req: Request, res: Response) => {
        try {
            const status = req.query.status ? String(req.query.status) : "aberto";
            return res.json(await this.service.listarAlertas(status === "todos" ? null : status, req.empresaId!));
        } catch (e: any) {
            return res.status(500).json({ message: e.message || "Erro ao listar alertas" });
        }
    };

    // GET /monitoramento/pendentes  (fora do limite, aguardando a janela)
    listarPendentes = async (req: Request, res: Response) => {
        try {
            return res.json(await this.service.listarPendentes(req.empresaId!));
        } catch (e: any) {
            return res.status(500).json({ message: e.message || "Erro ao listar pendentes" });
        }
    };

    // PATCH /monitoramento/alertas/:id/resolver
    resolverAlerta = async (req: Request, res: Response) => {
        try {
            await this.service.resolverAlertaManual(Number(req.params.id), req.empresaId!);
            return res.sendStatus(204);
        } catch (e: any) {
            return res.status(400).json({ message: e.message || "Erro ao resolver alerta" });
        }
    };

    // POST /monitoramento/alertas/:id/abrir-os   body: { solicitante_id? }
    abrirOS = async (req: Request, res: Response) => {
        try {
            const r = await this.service.abrirOSDoAlerta(
                Number(req.params.id),
                req.empresaId!,
                req.body?.solicitante_id ? Number(req.body.solicitante_id) : undefined
            );
            return res.status(201).json(r);
        } catch (e: any) {
            return res.status(400).json({ message: e.message || "Erro ao abrir O.S." });
        }
    };
}

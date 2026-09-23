import { Request, Response } from "express";
import { UsuarioService } from "../services/UsuarioService";

export class UsuarioController {

    private service = new UsuarioService();

    listar = async (req: Request, res: Response) => {
        const users = await this.service.listar(req.empresaId!);
        return res.json(users);
    };

    buscarPorId = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const user = await this.service.buscarPorId(id, req.empresaId!);
        return res.json(user);
    };

    criar = async (req: Request, res: Response) => {
        const user = await this.service.criar(req.body, req.empresaId!);
        return res.status(201).json(user);
    };

    atualizar = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const user = await this.service.atualizar(id, req.body, req.empresaId!);
        return res.json(user);
    };

    excluir = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        await this.service.excluir(id, req.empresaId!);
        return res.sendStatus(204);
    };
    alternarStatus = async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    const user = await this.service.alternarStatus(id, req.empresaId!);

    return res.json(user);
};
listarTecnicos = async (req: Request, res: Response) => {
    const tecnicos = await this.service.listarTecnicos(req.empresaId!);
    return res.json(tecnicos);
};
}
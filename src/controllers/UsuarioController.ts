import { Request, Response } from "express";
import { UsuarioService } from "../services/UsuarioService";

export class UsuarioController {

    private service = new UsuarioService();

    listar = async (req: Request, res: Response) => {
        const users = await this.service.listar();
        return res.json(users);
    };

    buscarPorId = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const user = await this.service.buscarPorId(id);
        return res.json(user);
    };

    criar = async (req: Request, res: Response) => {
        const user = await this.service.criar(req.body);
        return res.status(201).json(user);
    };

    atualizar = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const user = await this.service.atualizar(id, req.body);
        return res.json(user);
    };

    excluir = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        await this.service.excluir(id);
        return res.sendStatus(204);
    };
    alternarStatus = async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    const user = await this.service.alternarStatus(id);

    return res.json(user);
};
listarTecnicos = async (req: Request, res: Response) => {
    const tecnicos = await this.service.listarTecnicos();
    return res.json(tecnicos);
};
}
import { Request, Response } from "express";
import { MaquinaService } from "../services/MaquinaService";

export class MaquinaController {

    private service = new MaquinaService();

    listar = async (
        req: Request,
        res: Response
    ) => {

        const maquinas =
            await this.service.listar();

        return res.json(maquinas);
    };

    buscarPorId = async (
        req: Request,
        res: Response
    ) => {

        const id =
            Number(req.params.id);

        const maquina =
            await this.service.buscarPorId(id);

        return res.json(maquina);
    };

criar = async (req: Request, res: Response) => {
    try {
        const maquina = req.body;
        const file = req.file;

        const resultado = await this.service.criar(maquina, file);

        return res.status(201).json(resultado);
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || "Erro ao criar máquina"
        });
    }
};

   atualizar = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const maquina = req.body;
        const file = req.file;

        const resultado = await this.service.atualizar(
            id,
            maquina,
            file
        );

        return res.json(resultado);
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || "Erro ao atualizar máquina"
        });
    }
};

    excluir = async (
        req: Request,
        res: Response
    ) => {

        const id =
            Number(req.params.id);

        await this.service.excluir(id);

        return res.sendStatus(204);
    };
    alternarStatus = async (
    req: Request,
    res: Response
) => {

    const id = Number(req.params.id);

    const maquina =
        await this.service.alternarStatus(id);

    return res.json(maquina);
};
listarOsPorMaquina = async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    const os = await this.service.listarOsPorMaquina(id);

    return res.json(os);
};
}
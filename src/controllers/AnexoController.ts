import { Request, Response } from "express";
import { AnexoService } from "../services/AnexoService";

export class AnexoController {
    private service = new AnexoService();

    buscarPorId = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);

            const anexo = await this.service.buscarPorId(id);

            return res.json(anexo);
        } catch (error: any) {
            return res.status(404).json({
                message: error.message || "Anexo não encontrado"
            });
        }
    };

    listarPorMaquina = async (req: Request, res: Response) => {
        const maquinaId = Number(req.params.id);

        const anexos =
            await this.service.listarPorMaquina(maquinaId);

        return res.json(anexos);
    };

    listarPorOS = async (req: Request, res: Response) => {
        const osId = Number(req.params.id);

        const anexos = await this.service.listarPorOS(osId);

        return res.json(anexos);
    };

    upload = async (req: Request, res: Response) => {
        try {
            const file = req.file;

            if (!file) {
                return res.status(400).json({
                    message: "Arquivo não informado"
                });
            }

            const resultado = await this.service.upload(
                req.body,
                file
            );

            return res.status(201).json(resultado);
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Erro ao enviar anexo"
            });
        }
    };

    excluir = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);

            await this.service.excluir(id);

            return res.sendStatus(204);
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Erro ao excluir anexo"
            });
        }
    };
}
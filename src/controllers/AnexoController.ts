import { Request, Response } from "express";
import { AnexoService } from "../services/AnexoService";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { escopoOS } from "../middlewares/permissao";

const osRepo = new OrdemServicoRepository();

// quem só vê "as minhas O.S." não alcança anexos das dos outros
async function osAcessivel(req: Request, osId: number): Promise<boolean> {
    if (escopoOS(req) !== "proprias") return true;

    const os = await osRepo.buscarPorId(osId, req.empresaId!);

    return !os || os.id_solicitante === req.user!.id || os.id_tecnico === req.user!.id;
}

export class AnexoController {
    private service = new AnexoService();

    buscarPorId = async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);

            const anexo = await this.service.buscarPorId(id, req.empresaId!);

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
            await this.service.listarPorMaquina(maquinaId, req.empresaId!);

        return res.json(anexos);
    };

    listarPorOS = async (req: Request, res: Response) => {
        const osId = Number(req.params.id);

        if (!(await osAcessivel(req, osId))) return res.json([]);

        const anexos = await this.service.listarPorOS(osId, req.empresaId!);

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
                file,
                req.empresaId!
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

            await this.service.excluir(id, req.empresaId!);

            return res.sendStatus(204);
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Erro ao excluir anexo"
            });
        }
    };
}
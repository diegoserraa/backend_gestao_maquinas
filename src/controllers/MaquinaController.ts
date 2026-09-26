import { Request, Response } from "express";
import { lerPagina, responderPagina } from "../utils/paginacao";
import { escopoOS } from "../middlewares/permissao";
import { MaquinaService } from "../services/MaquinaService";

export class MaquinaController {

    private service = new MaquinaService();

    listar = async (
        req: Request,
        res: Response
    ) => {

        const { itens, total } =
            await this.service.listar(
                req.empresaId!,
                lerPagina(req, { padrao: 500, maximo: 1000 })
            );

        return responderPagina(res, itens, total);
    };

    /** Etiquetas (QR Code + identificação) para imprimir: ?ids=1,2,3 e/ou ?setor_id=4. */
    etiquetas = async (req: Request, res: Response) => {
        const inteiroPositivo = (v: string) => /^[0-9]{1,9}$/.test(v) && Number(v) > 0;

        const bruto = typeof req.query.ids === "string" ? req.query.ids.split(",").map((v) => v.trim()) : undefined;
        if (req.query.ids !== undefined && (bruto === undefined || bruto.length === 0 || !bruto.every(inteiroPositivo))) {
            return res.status(400).json({ error: "Informe as máquinas como números separados por vírgula" });
        }

        const setor = req.query.setor_id;
        if (setor !== undefined && !(typeof setor === "string" && inteiroPositivo(setor))) {
            return res.status(400).json({ error: "Setor inválido" });
        }

        return res.json(
            await this.service.gerarEtiquetas(req.empresaId!, {
                ids: bruto ? [...new Set(bruto.map(Number))] : undefined,
                setorId: setor ? Number(setor) : undefined,
            })
        );
    };

    buscarPorId = async (
        req: Request,
        res: Response
    ) => {

        const id =
            Number(req.params.id);

        const maquina =
            await this.service.buscarPorId(id, req.empresaId!);

        return res.json(maquina);
    };

criar = async (req: Request, res: Response) => {
    try {
        const maquina = req.body;
        const file = req.file;

        const resultado = await this.service.criar(maquina, req.empresaId!, file);

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
            req.empresaId!,
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

        await this.service.excluir(id, req.empresaId!);

        return res.sendStatus(204);
    };
    alternarStatus = async (
    req: Request,
    res: Response
) => {

    const id = Number(req.params.id);

    const maquina =
        await this.service.alternarStatus(id, req.empresaId!);

    return res.json(maquina);
};
listarOsPorMaquina = async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    // sem permissão de ver O.S. a lista vem vazia; com "só as minhas", filtrada
    const escopo = escopoOS(req);

    const os = escopo
        ? await this.service.listarOsPorMaquina(id, req.empresaId!, escopo === "proprias" ? req.user!.id : null)
        : [];

    return res.json(os);
};
}
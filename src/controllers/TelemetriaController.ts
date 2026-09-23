import { Request, Response } from "express";
import { TelemetriaService } from "../services/TelemetriaService";
import { getMqttStatus } from "../mqtt/telemetriaSubscriber";

export class TelemetriaController {

    private service = new TelemetriaService();

    // GET /telemetria  -> última leitura de todas as máquinas
    listar = async (req: Request, res: Response) => {
        try {
            const dados = await this.service.listarAtual(req.empresaId!);
            return res.json(dados);
        } catch (error: any) {
            return res.status(500).json({
                message: error.message || "Erro ao listar telemetria",
            });
        }
    };

    // GET /telemetria/status -> estado da conexão MQTT
    status = async (_req: Request, res: Response) => {
        return res.json(getMqttStatus());
    };

    // GET /telemetria/:maquinaId -> última leitura de uma máquina
    buscarPorMaquina = async (req: Request, res: Response) => {
        try {
            const maquinaId = Number(req.params.maquinaId);

            if (!Number.isInteger(maquinaId) || maquinaId <= 0) {
                return res.status(400).json({ message: "maquinaId inválido" });
            }

            const dados = await this.service.buscarPorMaquina(maquinaId, req.empresaId!);

            if (!dados) {
                return res.status(404).json({ message: "Máquina não encontrada" });
            }

            return res.json(dados);
        } catch (error: any) {
            return res.status(500).json({
                message: error.message || "Erro ao buscar telemetria",
            });
        }
    };

    // GET /telemetria/:maquinaId/historico?desde=ISO&limite=200
    historico = async (req: Request, res: Response) => {
        try {
            const maquinaId = Number(req.params.maquinaId);

            if (!Number.isInteger(maquinaId) || maquinaId <= 0) {
                return res.status(400).json({ message: "maquinaId inválido" });
            }

            const { desde, limite } = req.query;

            let desdeDate: Date | null = null;

            if (typeof desde === "string" && desde.trim() !== "") {
                const d = new Date(desde);
                if (!isNaN(d.getTime())) {
                    desdeDate = d;
                }
            }

            const dados = await this.service.listarHistorico(
                maquinaId,
                desdeDate,
                Number(limite),
                req.empresaId!
            );

            return res.json(dados);
        } catch (error: any) {
            return res.status(500).json({
                message: error.message || "Erro ao buscar histórico",
            });
        }
    };
}

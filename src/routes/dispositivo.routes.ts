import { Router } from "express";
import { pareamentoLimiter } from "../middlewares/rateLimitMiddleware";
import { PareamentoService } from "../services/PareamentoService";

/**
 * Rotas PÚBLICAS (sem token) — chamadas pelo próprio ESP32 na primeira
 * configuração, antes de ele saber qualquer coisa sobre o sistema.
 * Por isso ficam fora do authMiddleware (montadas direto em app.ts).
 */
const dispositivoRoutes = Router();

const pareamentoService = new PareamentoService();

// POST /dispositivos/parear  { codigo, mac? } -> { maquina_id, maquina_nome }
dispositivoRoutes.post("/parear", pareamentoLimiter, async (req, res) => {
    try {
        const { codigo, mac } = req.body ?? {};

        if (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo)) {
            return res.status(400).json({ message: "Código inválido" });
        }

        const resultado = await pareamentoService.resgatar(
            codigo,
            typeof mac === "string" ? mac.slice(0, 32) : undefined
        );

        return res.json(resultado);
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || "Erro ao resgatar código de pareamento",
        });
    }
});

export { dispositivoRoutes };

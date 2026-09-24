import { NextFunction, Request, Response, Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { acaoEmOS, escopoOS, exigir, exigirVerOS, permissaoAtribuir } from "../middlewares/permissao";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { osCriarSchema, osAtribuirSchema, osFinalizarSchema, osCancelarSchema, osPausarSchema } from "../schemas/ordemServico";
import { OrdemServicoController } from "../controllers/OrdemServicoController";

const ordemServicoRoutes = Router();
protegerParamsNumericos(ordemServicoRoutes);
const controller = new OrdemServicoController();
const osRepo = new OrdemServicoRepository();

// Quem só pode "ver as minhas O.S." não alcança as dos outros nem pelo id direto (responde como se não existisse).
ordemServicoRoutes.param("id", async (req: Request, res: Response, next: NextFunction, valor: string) => {
  if (escopoOS(req) !== "proprias") return next();

  const os = await osRepo.buscarPorId(Number(valor), req.empresaId!);
  const eDele = os && (os.id_solicitante === req.user!.id || os.id_tecnico === req.user!.id);

  return !os || eDele ? next() : res.status(404).json({ error: "Ordem de serviço não encontrada" });
});

// ─── Consulta e abertura ──────────────────────────────────────
ordemServicoRoutes.get("/", exigirVerOS, controller.listar);
ordemServicoRoutes.get("/:id", exigirVerOS, controller.buscarPorId);
ordemServicoRoutes.post("/", exigir("os.criar"), validarBody(osCriarSchema), controller.criar);

// kpis da tela de detalhes da máquina
ordemServicoRoutes.get("/maquina/:maquinaId/indicadores", exigir("maquinas.ver"), controller.indicadoresPorMaquina);

// ─── Ciclo de vida (só o que o sistema usa) ───────────────────
// Atribuir: a permissão depende do que se faz (assumir pra si / atribuir a outro / definir externo)
ordemServicoRoutes.patch("/:id/atribuir", validarBody(osAtribuirSchema), permissaoAtribuir, controller.atribuir);

// Iniciar / finalizar: na O.S. em que é o responsável, ou em qualquer uma com "agir em O.S. de outros"
ordemServicoRoutes.patch("/:id/iniciar", acaoEmOS("os.iniciar"), controller.iniciar);
// Pausar (com o motivo) e retomar: mesma permissão e mesma regra de "quem pode agir nesta O.S."
ordemServicoRoutes.patch("/:id/pausar", acaoEmOS("os.pausar"), validarBody(osPausarSchema), controller.pausar);
ordemServicoRoutes.patch("/:id/retomar", acaoEmOS("os.pausar"), controller.retomar);
// histórico de pausas da O.S. (quem enxerga a O.S. enxerga as pausas dela)
ordemServicoRoutes.get("/:id/pausas", exigirVerOS, controller.listarPausas);

ordemServicoRoutes.patch("/:id/finalizar", acaoEmOS("os.finalizar"), validarBody(osFinalizarSchema), controller.finalizar);

ordemServicoRoutes.patch("/:id/cancelar", exigir("os.cancelar"), validarBody(osCancelarSchema), controller.cancelar);

export { ordemServicoRoutes };

import { NextFunction, Request, Response, Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { acaoEmOS, escopoOS, exigir, exigirVerOS, permissaoAtribuir } from "../middlewares/permissao";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { osCriarSchema, osAtualizarSchema, osAtribuirSchema, osFinalizarSchema, osCancelarSchema, osPausarSchema, osPrioridadeSchema } from "../schemas/ordemServico";
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

// ─── CRUD base ────────────────────────────────────────────────
ordemServicoRoutes.get("/", exigirVerOS, controller.listar);
ordemServicoRoutes.get("/:id", exigirVerOS, controller.buscarPorId);
ordemServicoRoutes.post("/", exigir("os.criar"), validarBody(osCriarSchema), controller.criar);
ordemServicoRoutes.put("/:id", exigir("os.editar"), validarBody(osAtualizarSchema), controller.atualizar);
ordemServicoRoutes.delete("/:id", exigir("os.excluir"), controller.excluir);

// kpis da tela de detalhes da máquina
ordemServicoRoutes.get("/maquina/:maquinaId/indicadores", exigir("maquinas.ver"), controller.indicadoresPorMaquina);

// ─── Transições de ciclo de vida ──────────────────────────────
// Atribuir: a permissão depende do que se faz (assumir pra si / atribuir a outro / definir externo)
ordemServicoRoutes.patch("/:id/atribuir", validarBody(osAtribuirSchema), permissaoAtribuir, controller.atribuir);

// Iniciar / pausar / finalizar: na O.S. em que é o responsável, ou em qualquer uma com "agir em O.S. de outros"
ordemServicoRoutes.patch("/:id/iniciar", acaoEmOS("os.iniciar"), controller.iniciar);
ordemServicoRoutes.patch("/:id/pausar", acaoEmOS("os.pausar"), validarBody(osPausarSchema), controller.pausar);
ordemServicoRoutes.patch("/:id/finalizar", acaoEmOS("os.finalizar"), validarBody(osFinalizarSchema), controller.finalizar);

ordemServicoRoutes.patch("/:id/cancelar", exigir("os.cancelar"), validarBody(osCancelarSchema), controller.cancelar);
ordemServicoRoutes.patch("/:id/prioridade", exigir("os.alterar_prioridade"), validarBody(osPrioridadeSchema), controller.alterarPrioridade);

export { ordemServicoRoutes };

import { Router } from "express";
import { OrdemServicoController } from "../controllers/OrdemServicoController";

const ordemServicoRoutes = Router();
const controller = new OrdemServicoController();

// ─── CRUD base ────────────────────────────────────────────────
ordemServicoRoutes.get("/",        controller.listar);
ordemServicoRoutes.get("/:id",     controller.buscarPorId);
ordemServicoRoutes.post("/",       controller.criar);
ordemServicoRoutes.put("/:id",     controller.atualizar);
ordemServicoRoutes.delete("/:id",  controller.excluir);

// ─── Transições de ciclo de vida ──────────────────────────────
// Técnico se auto-atribui ou gestor atribui a um técnico
ordemServicoRoutes.patch("/:id/atribuir",   controller.atribuir);

// Técnico inicia o atendimento (ATRIBUIDA → EM_ANDAMENTO)
ordemServicoRoutes.patch("/:id/iniciar",    controller.iniciar);

// Técnico/gestor pausa (EM_ANDAMENTO → PAUSADA)
ordemServicoRoutes.patch("/:id/pausar",     controller.pausar);

// Técnico finaliza (EM_ANDAMENTO | PAUSADA → FINALIZADA)
ordemServicoRoutes.patch("/:id/finalizar",  controller.finalizar);

// Qualquer papel autorizado cancela (ABERTA | ATRIBUIDA | EM_ANDAMENTO → CANCELADA)
ordemServicoRoutes.patch("/:id/cancelar",   controller.cancelar);

// Gestor altera prioridade (qualquer status aberto)
ordemServicoRoutes.patch("/:id/prioridade", controller.alterarPrioridade);

export { ordemServicoRoutes };

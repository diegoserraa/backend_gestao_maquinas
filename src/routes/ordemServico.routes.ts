import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { osCriarSchema, osAtualizarSchema, osAtribuirSchema, osFinalizarSchema, osCancelarSchema, osPausarSchema, osPrioridadeSchema } from "../schemas/ordemServico";
import { OrdemServicoController } from "../controllers/OrdemServicoController";

const ordemServicoRoutes = Router();
protegerParamsNumericos(ordemServicoRoutes);
const controller = new OrdemServicoController();

// ─── CRUD base ────────────────────────────────────────────────
ordemServicoRoutes.get("/",        controller.listar);
ordemServicoRoutes.get("/:id",     controller.buscarPorId);
ordemServicoRoutes.post("/", validarBody(osCriarSchema), controller.criar);
ordemServicoRoutes.put("/:id", validarBody(osAtualizarSchema), controller.atualizar);
ordemServicoRoutes.delete("/:id",  controller.excluir);

//kpis machinedetails
ordemServicoRoutes.get("/maquina/:id/indicadores", controller.indicadoresPorMaquina);

// ─── Transições de ciclo de vida ──────────────────────────────
// Técnico se auto-atribui ou gestor atribui a um técnico
ordemServicoRoutes.patch("/:id/atribuir", validarBody(osAtribuirSchema), controller.atribuir);

// Técnico inicia o atendimento (ATRIBUIDA → EM_ANDAMENTO)
ordemServicoRoutes.patch("/:id/iniciar",    controller.iniciar);

// Técnico/gestor pausa (EM_ANDAMENTO → PAUSADA)
ordemServicoRoutes.patch("/:id/pausar", validarBody(osPausarSchema), controller.pausar);

// Técnico finaliza (EM_ANDAMENTO | PAUSADA → FINALIZADA)
ordemServicoRoutes.patch("/:id/finalizar", validarBody(osFinalizarSchema), controller.finalizar);

// Qualquer papel autorizado cancela (ABERTA | ATRIBUIDA | EM_ANDAMENTO → CANCELADA)
ordemServicoRoutes.patch("/:id/cancelar", validarBody(osCancelarSchema), controller.cancelar);

// Gestor altera prioridade (qualquer status aberto)
ordemServicoRoutes.patch("/:id/prioridade", validarBody(osPrioridadeSchema), controller.alterarPrioridade);

export { ordemServicoRoutes };

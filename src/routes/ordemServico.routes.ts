import { Router } from "express";
import { validarBody, protegerParamsNumericos } from "../middlewares/validate";
import { roleMiddleware } from "../middlewares/role.Middleware";
import { gestorOuResponsavel, permissaoAtribuir } from "../middlewares/osPermissao";
import { Role } from "../enums/Role";
import { osCriarSchema, osAtualizarSchema, osAtribuirSchema, osFinalizarSchema, osCancelarSchema, osPausarSchema, osPrioridadeSchema } from "../schemas/ordemServico";
import { OrdemServicoController } from "../controllers/OrdemServicoController";

const ordemServicoRoutes = Router();
protegerParamsNumericos(ordemServicoRoutes);
const controller = new OrdemServicoController();

const apenasGestor = roleMiddleware(Role.ADMIN, Role.GESTOR);

// ─── CRUD base ────────────────────────────────────────────────
// qualquer papel consulta e abre O.S.; editar/excluir é do gestor
ordemServicoRoutes.get("/",        controller.listar);
ordemServicoRoutes.get("/:id",     controller.buscarPorId);
ordemServicoRoutes.post("/", validarBody(osCriarSchema), controller.criar);
ordemServicoRoutes.put("/:id", apenasGestor, validarBody(osAtualizarSchema), controller.atualizar);
ordemServicoRoutes.delete("/:id", apenasGestor, controller.excluir);

//kpis machinedetails
ordemServicoRoutes.get("/maquina/:id/indicadores", controller.indicadoresPorMaquina);

// ─── Transições de ciclo de vida ──────────────────────────────
// Técnico se auto-atribui ou gestor atribui a um técnico (externo: só gestor)
ordemServicoRoutes.patch("/:id/atribuir", validarBody(osAtribuirSchema), permissaoAtribuir, controller.atribuir);

// Gestor, ou o técnico responsável, inicia o atendimento (ATRIBUIDA → EM_ANDAMENTO)
ordemServicoRoutes.patch("/:id/iniciar", gestorOuResponsavel, controller.iniciar);

// Gestor ou técnico responsável pausa (EM_ANDAMENTO → PAUSADA)
ordemServicoRoutes.patch("/:id/pausar", gestorOuResponsavel, validarBody(osPausarSchema), controller.pausar);

// Gestor ou técnico responsável finaliza (EM_ANDAMENTO | PAUSADA → FINALIZADA)
ordemServicoRoutes.patch("/:id/finalizar", gestorOuResponsavel, validarBody(osFinalizarSchema), controller.finalizar);

// Só o gestor cancela (ABERTA | ATRIBUIDA | EM_ANDAMENTO → CANCELADA)
ordemServicoRoutes.patch("/:id/cancelar", apenasGestor, validarBody(osCancelarSchema), controller.cancelar);

// Gestor altera prioridade (qualquer status aberto)
ordemServicoRoutes.patch("/:id/prioridade", apenasGestor, validarBody(osPrioridadeSchema), controller.alterarPrioridade);

export { ordemServicoRoutes };

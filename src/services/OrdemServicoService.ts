import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { IOrdemServico } from "../interfaces/IordemServico";

// Máquina de estados — quais transições são permitidas por rota semântica
const TRANSICOES: Record<string, string[]> = {
  ABERTA:      ["ATRIBUIDA", "CANCELADA"],
  ATRIBUIDA:   ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO:["PAUSADA", "FINALIZADA", "CANCELADA"],
  PAUSADA:     ["EM_ANDAMENTO", "CANCELADA"],
};

export class OrdemServicoService {

  private repo = new OrdemServicoRepository();

  // ─── helpers ──────────────────────────────────────────────
  private async buscarOuFalhar(id: number): Promise<IOrdemServico> {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new Error("Ordem de serviço não encontrada");
    return os;
  }

  private validarTransicao(statusAtual: string, statusNovo: string) {
    if (!TRANSICOES[statusAtual]?.includes(statusNovo)) {
      throw new Error(`Transição inválida: ${statusAtual} → ${statusNovo}`);
    }
  }

  // ─── CRUD base ────────────────────────────────────────────
  async listar() {
    return this.repo.listar();
  }

  async buscarPorId(id: number) {
    return this.buscarOuFalhar(id);
  }

  async criar(dados: IOrdemServico) {
    return this.repo.criar({
      ...dados,
      status: "ABERTA",
    });
  }

  async atualizar(id: number, dados: IOrdemServico) {
    await this.buscarOuFalhar(id);
    return this.repo.atualizar(id, dados);
  }

  async excluir(id: number) {
    await this.buscarOuFalhar(id);
    await this.repo.excluir(id);
  }

  // ─── patches semânticos ───────────────────────────────────

  /**
   * Técnico se auto-atribui (id_atribuido_por == id_tecnico)
   * ou gestor atribui a um técnico (id_atribuido_por != id_tecnico).
   * Body: { id_tecnico, id_atribuido_por }
   */
  async atribuir(id: number, id_tecnico: number, id_atribuido_por: number) {
    const os = await this.buscarOuFalhar(id);
    this.validarTransicao(os.status, "ATRIBUIDA");

    return this.repo.patch(id, {
      id_tecnico,
      id_atribuido_por,
      data_atribuicao: new Date().toISOString(),
      status: "ATRIBUIDA",
    });
  }

  /**
   * Técnico inicia o atendimento → EM_ANDAMENTO + data_inicio_atendimento
   */
  async iniciar(id: number) {
    const os = await this.buscarOuFalhar(id);
    this.validarTransicao(os.status, "EM_ANDAMENTO");

    return this.repo.patch(id, {
      status: "EM_ANDAMENTO",
      data_inicio_atendimento: new Date().toISOString(),
    });
  }

  /**
   * Finaliza a OS → FINALIZADA + resolucao + data_resolucao
   */
async finalizar(
  id: number,
  resolucao: string,
  valor_gasto?: number
) {
  const os = await this.buscarOuFalhar(id);

  this.validarTransicao(
    os.status,
    "FINALIZADA"
  );

  if (!resolucao?.trim()) {
    throw new Error(
      "Resolução é obrigatória para finalizar"
    );
  }

  if ((valor_gasto ?? 0) < 0) {
    throw new Error(
      "Valor gasto não pode ser negativo"
    );
  }

  return this.repo.patch(id, {
    status: "FINALIZADA",
    resolucao,
    valor_gasto: valor_gasto ?? 0,
    data_resolucao: new Date().toISOString(),
  });
}

  /**
   * Cancela a OS em qualquer status permitido
   */
  async cancelar(id: number, motivo_cancelamento: string) {
    const os = await this.buscarOuFalhar(id);
    this.validarTransicao(os.status, "CANCELADA");

    if (!motivo_cancelamento?.trim()) {
      throw new Error("Motivo é obrigatório para cancelar");
    }

    return this.repo.patch(id, {
      status: "CANCELADA",
      motivo_cancelamento,
      data_cancelamento: new Date().toISOString(),
    });
  }

  /**
   * Pausa a OS (ex: aguardando peça)
   */
  async pausar(id: number, motivo_cancelamento: string) {
    const os = await this.buscarOuFalhar(id);
    this.validarTransicao(os.status, "PAUSADA");

    return this.repo.patch(id, {
      status: "PAUSADA",
      motivo_cancelamento, // reutiliza campo para motivo da pausa
    });
  }

  /**
   * Altera prioridade — permitido em qualquer status aberto
   */
  async alterarPrioridade(id: number, prioridade: string) {
    const os = await this.buscarOuFalhar(id);

    if (["FINALIZADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível alterar prioridade de OS encerrada");
    }

    return this.repo.patch(id, { prioridade });
  }
}

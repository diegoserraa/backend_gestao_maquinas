export interface FiltrosRelatorioOS {
  empresaId: string;
  dataInicial?: string;
  dataFinal?: string;
  setorId?: number;
  maquinaId?: number;
  status?: string;
  tipoManutencao?: string;
  /** só O.S. marcadas como "máquina parada" na abertura (ver IordemServico) */
  apenasParada?: boolean;
}

export interface FiltrosRelatorioMaquina {
  empresaId: string;
  dataInicial?: string;
  dataFinal?: string;
  setorId?: number;
  maquinaId?: number;
}

export interface RelatorioOS {
  id: number;
  maquina_nome: string;
  setor_nome: string;
  descricao: string | null;
  status: string;
  tipo_manutencao: string | null;
  prioridade: string | null;
  tecnico_nome: string | null;
  solicitante_nome: string | null;
  data_abertura: Date | null;
  data_atribuicao: Date | null;
  data_inicio_atendimento: Date | null;
  data_resolucao: Date | null;
  resolucao: string | null;
  motivo_cancelamento: string | null;
  valor_gasto: number | null;
  id_parceiro: number | null;
  valor_parceiro: number | null;
  tempo_pausado_segundos: number | null;
  // "máquina parada" (v1 enxuto) — respondido só na abertura, duração sempre
  // calculada na consulta (nunca guardada) — ver DashboardRepository.obterResumoParadas
  maquina_parada: boolean;
  motivo_parada: string | null;
  tempo_parado_segundos: number | null;
}

export interface FiltrosRelatorioTecnico {
  empresaId: string;
  dataInicial?: string;
  dataFinal?: string;
}

export interface RelatorioProdutividadeTecnico {
  tecnico_id: number;
  tecnico_nome: string;

  // no período filtrado
  os_finalizadas: number;
  os_finalizadas_prioritarias: number; // prioridade ALTA ou CRITICA
  tempo_medio_atendimento_segundos: number | null; // início -> resolução, descontando pausa

  // estado ATUAL (independe do período — é a fila de hoje)
  os_em_aberto: number;
}

export interface RelatorioIndicadorMaquina {
  maquina_id: number;
  maquina_nome: string;
  setor_nome: string | null;

  os_abertas: number;
  os_atribuidas: number;
  os_canceladas: number;
  os_em_andamento: number;
  os_pausadas: number;
  total_os: number;
  os_finalizadas: number;

  mttr_segundos: number | null;
  mtbf_segundos: number | null;
  tempo_atendimento_segundos: number | null;

  corretivas: number;
  preventivas: number;

  ultima_os_abertura: Date | null;
  ultima_manutencao: Date | null;
}
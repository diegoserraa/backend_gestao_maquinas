export interface IOrdemServico {
  id?: number;
  maquina_id: number;
  descricao: string;
  status: string;
  data_abertura?: string;
  tipo_manutencao?: string;
  resolucao?: string;
  data_resolucao?: string;
  prioridade?: string;
  id_tecnico?: number | null;
  valor_gasto?: number;
  id_parceiro?: number | null;
  execucao_externa?: boolean;

  valor_parceiro?: number | null;


  // novas colunas
  id_solicitante?: number;
  data_atribuicao?: string;
  id_atribuido_por?: number;
  data_inicio_atendimento?: string;
  motivo_cancelamento?: string;
  data_cancelamento?: string;

  // pausa: tempo já pausado (pausas encerradas), início da pausa em curso e o motivo dela
  tempo_pausado_segundos?: number;
  pausada_em?: string | null;
  motivo_pausa?: string | null;
  // só na leitura: segundos da pausa em curso até agora (calculado pelo banco)
  pausa_atual_segundos?: number;
  // só na leitura: nome de quem abriu a O.S.
  solicitante_nome?: string | null;
}

export interface IPausaOS {
  id: number;
  os_id: number;
  motivo: string;
  pausada_em: string;
  retomada_em: string | null;
  pausada_por: number | null;
  pausada_por_nome: string | null;
  retomada_por: number | null;
  retomada_por_nome: string | null;
  duracao_segundos: number | null;
}

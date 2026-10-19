export type TipoGatilhoPreventiva = "DIAS" | "HORAS";

export interface IPlanoManutencao {
  id?: number;
  maquina_id: number;
  empresa_id?: string;
  descricao: string;
  tipo_gatilho: TipoGatilhoPreventiva;
  intervalo_dias?: number | null;
  intervalo_horas?: number | null;
  proxima_data?: string | null;
  horas_referencia?: number | null;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;

  // só de ENTRADA (não é persistido): se informado na criação/edição de um
  // plano por DIAS, a "próxima" é calculada a partir desta data em vez de
  // hoje — pra quando o plano não está começando do zero (ex.: implantador
  // sabe que a última troca de óleo foi há 20 dias, intervalo é 90, então a
  // próxima é em 70 dias, não em 90)
  ultima_manutencao?: string | null;
}

/** Um plano com vencimento batido, pronto pra virar O.S. — a varredura do job usa isto. */
export interface IPlanoVencido extends IPlanoManutencao {
  maquina_nome: string;
}

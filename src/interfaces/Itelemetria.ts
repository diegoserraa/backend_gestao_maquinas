export interface ITelemetriaLeitura {
    id?: number;
    maquina_id: number;
    temperatura: number | null;
    vibracao: number | null;
    horas_ligadas: number | null;
    recebido_em?: Date;
    payload_bruto?: unknown;
}

export interface ITelemetriaAtual {
    maquina_id: number;
    temperatura: number | null;
    vibracao: number | null;
    horas_ligadas: number | null;
    atualizado_em: Date;
}

/**
 * Leitura já normalizada + dados da máquina, no formato enviado
 * para o front (REST e WebSocket).
 */
export interface ILimiteMetrica {
    atencao: number | null;
    alarme: number | null;
    minimo: number | null;
}

export interface ITelemetriaAtualComMaquina {
    maquina_id: number;
    empresa_id: string;
    maquina_nome: string | null;
    imagem_url: string | null;
    setor_id: number | null;
    setor_nome: string | null;
    status: string | null;
    temperatura: number | null;
    vibracao: number | null;
    horas_ligadas: number | null;
    atualizado_em: Date | null;
    // limites configurados por métrica (maquina_parametros)
    limites: Record<string, ILimiteMetrica>;
}

export type FaixaHistorico = "1h" | "6h" | "24h" | "7d" | "30d";

export type MetricaHistorico = "temperatura" | "vibracao" | "horas_ligadas";

/**
 * Ponto já agregado por "balde" de tempo (date_trunc + AVG/MIN/MAX no banco).
 * Mesmo shape que o front já espera em PontoAgregado — não mudar sem
 * atualizar front-maquinas/src/modules/monitoramento/monitoramentoTypes.ts.
 */
export interface IPontoAgregado {
    instante: Date; // início do balde
    media: number | null;
    minimo: number | null;
    maximo: number | null;
}

/** Linha "crua" do relatório de telemetria — igual a ITelemetriaLeitura, com
 * o nome da máquina junto (útil quando o relatório cobre várias máquinas) e
 * os limites configurados dela (pra colorir atenção/crítico na tabela do
 * front, mesma régua do resto do sistema). */
export interface ITelemetriaLeituraComMaquina extends ITelemetriaLeitura {
    maquina_nome: string | null;
    limites: Record<string, ILimiteMetrica>;
}

export interface IFaixaMetrica {
    media: number | null;
    minimo: number | null;
    maximo: number | null;
}

/** Resumo do período do relatório — "horas" só vem preenchido quando o
 * filtro é de uma máquina só (horímetro é por máquina, não dá pra somar
 * entre máquinas diferentes). */
export interface IResumoRelatorioTelemetria {
    total_leituras: number;
    periodo_desde: Date | null;
    periodo_ate: Date | null;
    temperatura: IFaixaMetrica;
    vibracao: IFaixaMetrica;
    horas: { inicio: number | null; fim: number | null; trabalhadas: number | null } | null;
}

/** Um ponto por dia do período — alimenta o gráfico de tendência do relatório.
 * Calculado sobre o período INTEIRO (igual o resumo), nunca sobre a lista
 * cortada pelo "limite" — senão um período grande mostraria só o fim dele. */
export interface IPontoRelatorioDiario {
    dia: Date;
    leituras: number;
    temperatura: number | null;
    vibracao: number | null;
}

export interface IRelatorioTelemetria {
    leituras: ITelemetriaLeituraComMaquina[];
    resumo: IResumoRelatorioTelemetria;
    porDia: IPontoRelatorioDiario[];
    truncado: boolean;
}

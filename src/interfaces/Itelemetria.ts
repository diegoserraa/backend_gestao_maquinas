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

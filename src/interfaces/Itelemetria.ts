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

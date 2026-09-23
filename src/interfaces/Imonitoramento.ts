export type ChaveParametro = string; // 'temperatura' | 'vibracao' | ...

export interface IMaquinaParametro {
    id?: number;
    maquina_id: number;
    chave: ChaveParametro;
    unidade: string | null;
    minimo: number | null;
    atencao: number | null;
    alarme: number | null;
    janela_seg: number;
    abrir_os_auto: boolean;
    ativo: boolean;
}

export type NivelAlerta = "normal" | "atencao" | "critico" | "sem_sinal";

export interface ITelemetriaAlerta {
    id?: number;
    empresa_id?: string;
    maquina_id: number;
    chave: ChaveParametro;
    nivel: NivelAlerta;
    valor: number | null;
    limite: number | null;
    status: "aberto" | "resolvido" | "convertido";
    ordem_servico_id: number | null;
    detalhe: string | null;
    aberto_em?: string;
    resolvido_em?: string | null;
}

export interface IAlertaEstado {
    maquina_id: number;
    chave: ChaveParametro;
    nivel: NivelAlerta;
    fora_desde: Date | null;
    valor_pico: number | null;
    alerta_id: number | null;
}

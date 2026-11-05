export interface IMaquina {
    id?: number;
    nome: string;
    modelo: string;
    fabricante: string;
    ano: number;
    setor_id: number;
    status: string;
    intervalo_manutencao_dias: number;
    ultima_manutencao?: Date;
    proxima_manutencao?: Date;
    qr_code?: string;
    created_at?: Date;
    imagem_url?: string | null;
    // módulo "Monitoramento" independente: máquina só aparece no dashboard
    // depois de ativada aqui manualmente (ver TelemetriaRepository.listarAtual)
    monitoramento_ativo?: boolean;
    // preenchido só quando a máquina veio de "vincular máquina do cliente"
    // (ver IMaquinaVinculoExterno) — null pra cadastro normal
    referencia_externa?: string | null;
    sistema_origem?: string | null;
    // true só quando existe linha em maquinas_vinculo_externo — diferente de
    // referencia_externa/sistema_origem, que podem ficar em branco mesmo
    // numa máquina vinculada (sinal confiável pro front saber qual é qual)
    vinculo_externo?: boolean;
}

/** Máquina enxuta de um cliente que gerencia o próprio parque em outro
 * sistema — não tem plano de manutenção real aqui, só existe pra telemetria
 * ter onde colar. Ver migration 2026_11_05_vinculo_externo. */
export interface IMaquinaVinculoExterno {
    maquina_id: number;
    referencia_externa: string | null;
    sistema_origem: string | null;
    observacao: string | null;
    criado_em?: Date;
}

export interface INovoVinculoExterno {
    nome: string;
    setor_id: number;
    referencia_externa?: string;
    sistema_origem?: string;
    observacao?: string;
}
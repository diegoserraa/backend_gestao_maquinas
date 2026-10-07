export interface IMaquinaPareamento {
    id?: number;
    maquina_id: number;
    empresa_id?: string;
    codigo: string;
    criado_em?: Date;
    expira_em: Date;
    usado_em?: Date | null;
    mac_dispositivo?: string | null;
}

/** Devolvido pro usuário logado ao gerar o PIN pra mostrar na tela. */
export interface IPareamentoGerado {
    codigo: string;
    expira_em: Date;
}

/** Devolvido pro ESP32 ao resgatar o PIN — só o que ele precisa pra se configurar. */
export interface IPareamentoResgatado {
    maquina_id: number;
    maquina_nome: string;
}

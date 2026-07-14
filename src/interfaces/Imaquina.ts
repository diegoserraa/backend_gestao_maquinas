export interface IMaquina {
    id?: number;
    nome: string;
    modelo: string;
    fabricante: string;
    ano: number;
    setor_id: number;
    status: string;
    intervalo_manutencao_dias: number;
    qr_code?: string;
    created_at?: Date;
    imagem_url?: string | null;
}
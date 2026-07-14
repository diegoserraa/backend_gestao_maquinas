export interface IAnexo {
  id?: number;
  maquina_id?: number | null;
  ordem_servico_id?: number | null;
  nome_arquivo: string;
  caminho_arquivo: string;
  url_arquivo: string;
  tipo_arquivo?: string;
  origem:
    | "MAQUINA"
    | "OS_ABERTURA"
    | "OS_FECHAMENTO";
  created_at?: Date;
}
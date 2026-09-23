import { Role } from "../enums/Role";

export interface IUsuario {
    id?: number;
    empresa_id?: string;
    nome: string;
    email: string;
    senha: string;
    role: Role;
    ativo?: boolean;
    created_at?: Date;
}
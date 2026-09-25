import { Role } from "../enums/Role";

/** Formato do payload assinado dentro do JWT (AuthService.login). */
export interface TokenPayload {
    id: number;
    role: Role;
    empresa_id: string;
    /** versão da sessão (sobe quando o usuário troca a senha) */
    sv?: number;
    iat?: number;
    exp?: number;
}

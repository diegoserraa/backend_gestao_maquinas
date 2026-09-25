import jwt from "jsonwebtoken";
import { Role } from "../enums/Role";

/**
 * Único lugar que assina o token de sessão. `sv` é a "versão da sessão" do usuário: quando ele troca a
 * senha, a versão sobe no banco e todo token com versão antiga (outros aparelhos, token vazado) deixa de valer.
 */
export function gerarToken(usuario: { id: number; role: Role | string; empresa_id: string; versao_sessao?: number | null }): string {
    return jwt.sign(
        {
            id: usuario.id,
            role: usuario.role,
            empresa_id: usuario.empresa_id,
            sv: usuario.versao_sessao ?? 0,
        },
        process.env.JWT_SECRET as string,
        { expiresIn: "1d" }
    );
}

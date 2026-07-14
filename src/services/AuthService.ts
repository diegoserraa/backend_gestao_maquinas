import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";

export class AuthService {

    private repo = new UsuarioRepository();

    async login(email: string, senha: string) {

        const user = await this.repo.buscarPorEmail(email);

        if (!user) {
            throw new Error("Usuário ou senha inválidos");
        }

        const senhaOk = await bcrypt.compare(senha, user.senha);

        if (!senhaOk) {
            throw new Error("Usuário ou senha inválidos");
        }
        const JWT_SECRET = process.env.JWT_SECRET!;
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        return {
            token,
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        };
    }
}
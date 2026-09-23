import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { logger } from "../config/logger";

export class AuthService {

    private repo = new UsuarioRepository();

    async login(email: string, senha: string) {

        // nunca loga a senha em si — só o e-mail e o resultado. Dá pra
        // notar um padrão de tentativa de invasão numa conta específica.
        const user = await this.repo.buscarPorEmail(email);

        if (!user) {
            logger.warn({ email }, "login falhou: usuário não existe");
            throw new Error("Usuário ou senha inválidos");
        }

        const senhaOk = await bcrypt.compare(senha, user.senha);

        if (!senhaOk) {
            logger.warn({ email, userId: user.id }, "login falhou: senha incorreta");
            throw new Error("Usuário ou senha inválidos");
        }

        logger.info({ email, userId: user.id, empresaId: user.empresa_id }, "login bem-sucedido");

        const JWT_SECRET = process.env.JWT_SECRET!;
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                empresa_id: user.empresa_id
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
                role: user.role,
                empresa_id: user.empresa_id
            }
        };
    }
}
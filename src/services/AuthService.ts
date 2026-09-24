import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { logger } from "../config/logger";
import { permissaoService } from "./PermissaoService";
import { invalido } from "../utils/erros";

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

        if (user.ativo === false) {
            logger.warn({ email, userId: user.id }, "login recusado: usuário inativo");
            throw invalido("Usuário inativo. Fale com o gestor da sua empresa.");
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

        // as permissões já vêm no login: o front monta menus e botões sem uma segunda chamada
        const perfil = await permissaoService.perfil(user.id as number);

        return {
            token,
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role,
                empresa_id: user.empresa_id
            },
            permissoes: [...(perfil?.permissoes ?? [])]
        };
    }
}
import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { logger } from "../config/logger";
import { permissaoService } from "./PermissaoService";
import { invalido } from "../utils/erros";
import { gerarToken } from "../utils/token";
import { EmpresaAdminRepository } from "../repositories/EmpresaAdminRepository";

export class AuthService {

    private repo = new UsuarioRepository();
    private empresas = new EmpresaAdminRepository();

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

        // empresa inativada pelo dono do sistema: ninguém dela entra (depois de conferir a senha, para não revelar nada)
        const empresa = await this.empresas.situacao(user.empresa_id as string);
        if (!empresa || !empresa.ativo) {
            logger.warn({ email, userId: user.id, empresaId: user.empresa_id }, "login recusado: empresa inativa");
            throw invalido("Empresa inativa. Fale com o suporte.");
        }

        await this.repo.registrarAcesso(user.id as number);

        logger.info({ email, userId: user.id, empresaId: user.empresa_id }, "login bem-sucedido");

        const token = gerarToken({
            id: user.id as number,
            role: user.role,
            empresa_id: user.empresa_id as string,
            versao_sessao: user.versao_sessao,
        });

        // as permissões já vêm no login: o front monta menus e botões sem uma segunda chamada
        const perfil = await permissaoService.perfil(user.id as number);

        return {
            token,
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role,
                empresa_id: user.empresa_id,
                // conta criada pelo painel: a tela leva direto para a troca da senha temporária
                deve_trocar_senha: user.deve_trocar_senha === true
            },
            permissoes: [...(perfil?.permissoes ?? [])]
        };
    }
}
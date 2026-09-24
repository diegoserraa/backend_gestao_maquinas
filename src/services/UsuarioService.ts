import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { IUsuario } from "../interfaces/Iusuario";
import { Ator, permissaoService } from "./PermissaoService";
import { PAPEIS_GERENCIAVEIS } from "../permissoes/catalogo";
import { invalido, naoEncontrado, proibido } from "../utils/erros";

/**
 * Cadastro de funcionários. Além da permissão da ação (checada na rota), valem regras
 * sobre QUEM pode mexer em QUEM:
 *  - gestor cadastra e mexe só em técnicos e operadores (nunca em outro gestor, nem em si);
 *  - só o administrador (dono do sistema) cria/edita gestores;
 *  - ninguém concede o perfil de administrador pela API.
 */
export class UsuarioService {

    private repo = new UsuarioRepository();

    async listar(empresaId: string) {
        return this.repo.listar(empresaId);
    }

    async buscarPorId(id: number, empresaId: string) {
        const user = await this.repo.buscarPorId(id, empresaId);

        if (!user) {
            throw naoEncontrado("Usuário não encontrado");
        }

        return user;
    }

    /** Quem chama pode mexer neste funcionário? */
    private conferirAlvo(ator: Ator, alvo: { id?: number; role: string }) {
        if (ator.role === "ADMIN") return;

        if (alvo.id === ator.id) {
            throw proibido("Você não pode alterar o seu próprio cadastro por aqui");
        }

        if (!PAPEIS_GERENCIAVEIS.includes(alvo.role as never)) {
            throw proibido("Somente o administrador gerencia gestores");
        }
    }

    /** Que tipo de funcionário este ator pode definir? */
    private conferirNovoPapel(ator: Ator, novoPapel: string, papelAtual?: string) {
        if (novoPapel === "ADMIN") {
            if (papelAtual === "ADMIN") return; // já era admin e continua
            throw proibido("O perfil de administrador não pode ser concedido");
        }

        if (papelAtual === "ADMIN") {
            throw proibido("O perfil de administrador não pode ser alterado por aqui");
        }

        if (!PAPEIS_GERENCIAVEIS.includes(novoPapel as never) && ator.role !== "ADMIN") {
            throw proibido("Somente o administrador cadastra gestores");
        }
    }

    async criar(user: IUsuario, empresaId: string, ator: Ator) {

        this.conferirNovoPapel(ator, user.role);

        const existe = await this.repo.buscarPorEmail(user.email);

        if (existe) {
            throw invalido("Email já cadastrado");
        }

        const senhaHash = await bcrypt.hash(user.senha, 10);

        const criado = await this.repo.criar({
            ...user,
            senha: senhaHash,
            empresa_id: empresaId
        });

        // nasce com o padrão do tipo (limitado ao que quem cadastrou possui)
        await permissaoService.aplicarPadraoAoCriar(ator, {
            id: criado.id as number,
            role: criado.role,
            empresaId,
        });

        return criado;
    }

    async atualizar(id: number, user: IUsuario, empresaId: string, ator: Ator) {

        const existente = await this.repo.buscarPorId(id, empresaId);

        if (!existente) {
            throw naoEncontrado("Usuário não encontrado");
        }

        this.conferirAlvo(ator, existente);
        this.conferirNovoPapel(ator, user.role, existente.role);

        const atualizado = await this.repo.atualizar(id, user, empresaId);

        // mudou de tipo: recebe o padrão do novo tipo; ativo/inativo: vale na hora
        if (existente.role !== user.role) {
            await permissaoService.aplicarPadraoAoCriar(
                ator,
                { id, role: user.role, empresaId },
                "mudanca_de_tipo"
            );
        }

        permissaoService.invalidar(id);

        return atualizado;
    }

    async excluir(id: number, empresaId: string, ator: Ator) {

        const existente = await this.repo.buscarPorId(id, empresaId);

        if (!existente) {
            throw naoEncontrado("Usuário não encontrado");
        }

        if (id === ator.id) {
            throw proibido("Você não pode excluir a sua própria conta");
        }

        this.conferirAlvo(ator, existente);

        await this.repo.excluir(id, empresaId);

        permissaoService.invalidar(id);
    }

    async alternarStatus(id: number, empresaId: string, ator: Ator) {

        const existente = await this.repo.buscarPorId(id, empresaId);

        if (!existente) {
            throw naoEncontrado("Usuário não encontrado");
        }

        if (id === ator.id) {
            throw proibido("Você não pode desativar a sua própria conta");
        }

        this.conferirAlvo(ator, existente);

        const atualizado = await this.repo.alternarStatus(id, !existente.ativo, empresaId);

        // desativar corta o acesso imediatamente (mesmo com token ainda válido)
        permissaoService.invalidar(id);

        return atualizado;
    }

    async listarTecnicos(empresaId: string) {
        return this.repo.listarTecnicos(empresaId);
    }
}

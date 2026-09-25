import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { permissaoService } from "./PermissaoService";
import { invalido, naoEncontrado } from "../utils/erros";
import { logger } from "../config/logger";
import { gerarToken } from "../utils/token";

const log = logger.child({ modulo: "conta" });

/** Regra da senha nova: 8+ caracteres, com letra e número. */
export function validarNovaSenha(nova: string, atual: string): string | null {
    if (nova.length < 8) return "A nova senha precisa ter pelo menos 8 caracteres";
    if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) return "A nova senha precisa ter letras e números";
    if (nova === atual) return "A nova senha precisa ser diferente da atual";
    return null;
}

/** Conta do próprio usuário (qualquer perfil). */
export class ContaService {

    private repo = new UsuarioRepository();

    /** Troca a senha e devolve um token novo: todos os outros (aparelhos, tokens vazados) deixam de valer. */
    async trocarSenha(usuario: { id: number; role: string; empresaId: string }, senhaAtual: string, novaSenha: string): Promise<string> {
        const usuarioId = usuario.id;
        const hash = await this.repo.buscarSenhaHash(usuarioId);
        if (!hash) throw naoEncontrado("Usuário não encontrado");

        if (!(await bcrypt.compare(senhaAtual, hash))) {
            log.warn({ usuarioId }, "troca de senha recusada: senha atual incorreta");
            throw invalido("A senha atual está incorreta");
        }

        const problema = validarNovaSenha(novaSenha, senhaAtual);
        if (problema) throw invalido(problema);

        const versao = await this.repo.atualizarSenha(usuarioId, await bcrypt.hash(novaSenha, 10));

        // a marca "senha temporária" some e a versão nova vale na próxima requisição (e derruba o tempo real antigo)
        permissaoService.invalidar(usuarioId);

        log.info({ usuarioId }, "senha alterada; outras sessões encerradas");

        return gerarToken({ id: usuarioId, role: usuario.role, empresa_id: usuario.empresaId, versao_sessao: versao });
    }
}

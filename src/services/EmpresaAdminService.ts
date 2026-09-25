import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { DadosDaEmpresa, EmpresaAdminRepository } from "../repositories/EmpresaAdminRepository";
import { permissaoService } from "./PermissaoService";
import { invalido, naoEncontrado } from "../utils/erros";
import { somenteDigitos } from "../utils/cnpj";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "admin-empresas" });

// sem caracteres que se confundem (0/O, 1/l/I) — a senha é lida/digitada por uma pessoa
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Senha temporária aleatória (12 caracteres, sempre com letra e número). */
export function gerarSenhaTemporaria(tamanho = 12): string {
    for (;;) {
        let senha = "";
        for (let i = 0; i < tamanho; i++) senha += ALFABETO[randomInt(ALFABETO.length)];
        if (/[A-Za-z]/.test(senha) && /\d/.test(senha)) return senha;
    }
}

const erroDeUnicidade = (erro: any) => {
    if (erro?.code !== "23505") return null;
    return String(erro?.constraint ?? "").includes("cnpj")
        ? invalido("Já existe uma empresa com esse CNPJ")
        : invalido("Esse e-mail já está cadastrado em outra conta");
};

/**
 * Painel do dono do sistema: cadastrar empresas (identificação e cobrança), editar, e inativar/reativar.
 * Só é alcançado por rotas que exigem o perfil ADMIN. Não lê nem mostra dados de operação do cliente.
 */
export class EmpresaAdminService {

    constructor(private repo = new EmpresaAdminRepository()) {}

    async listar() {
        return { empresas: await this.repo.listar() };
    }

    async detalhar(id: string) {
        const empresa = await this.repo.buscar(id);
        if (!empresa) throw naoEncontrado("Empresa não encontrada");

        return { empresa, gestores: await this.repo.gestores(id) };
    }

    private async conferirUnicidade(dados: DadosDaEmpresa, exceto?: string) {
        if (await this.repo.nomeExiste(dados.nome, exceto)) throw invalido("Já existe uma empresa com esse nome");

        if (dados.cnpj && (await this.repo.cnpjExiste(dados.cnpj, exceto))) throw invalido("Já existe uma empresa com esse CNPJ");
    }

    /** Guarda o CNPJ só com dígitos (14) — a tela é que formata. */
    private limpar(dados: DadosDaEmpresa): DadosDaEmpresa {
        return { ...dados, cnpj: dados.cnpj ? somenteDigitos(dados.cnpj) : undefined };
    }

    /**
     * Cria a empresa e o primeiro gestor, que nasce com uma senha temporária (devolvida UMA vez, aqui) e
     * precisa trocá-la no primeiro acesso.
     */
    async criar(entrada: DadosDaEmpresa & { gestor: { nome: string; email: string; telefone?: string } }, adminId: number) {
        const { gestor, ...resto } = entrada;
        const dados = this.limpar(resto);

        await this.conferirUnicidade(dados);
        if (await this.repo.emailExiste(gestor.email)) throw invalido("Esse e-mail já está cadastrado em outra conta");

        const senhaTemporaria = gerarSenhaTemporaria();
        const senhaHash = await bcrypt.hash(senhaTemporaria, 10);

        let criado;
        try {
            criado = await this.repo.criarComGestor(dados, { ...gestor, senhaHash }, adminId);
        } catch (erro) {
            // corrida entre duas criações iguais: o banco é quem garante a unicidade
            throw erroDeUnicidade(erro) ?? erro;
        }

        log.info({ empresaId: criado.empresa.id, gestorId: criado.gestor.id, por: adminId }, "empresa criada pelo painel");

        return { ...criado, senha_temporaria: senhaTemporaria };
    }

    async atualizar(id: string, entrada: DadosDaEmpresa, adminId: number) {
        if (!(await this.repo.buscar(id))) throw naoEncontrado("Empresa não encontrada");

        const dados = this.limpar(entrada);
        await this.conferirUnicidade(dados, id);

        try {
            await this.repo.atualizarDados(id, dados, adminId);
        } catch (erro) {
            throw erroDeUnicidade(erro) ?? erro;
        }

        log.info({ empresaId: id, por: adminId }, "dados da empresa alterados pelo painel");

        return this.detalhar(id);
    }

    /** Inativa (todos da empresa perdem o acesso na hora; os dados ficam guardados) ou reativa. */
    async definirSituacao(id: string, ativo: boolean, motivo: string | undefined, dono: { usuarioId: number; empresaId: string }) {
        const empresa = await this.repo.buscar(id);
        if (!empresa) throw naoEncontrado("Empresa não encontrada");

        if (!ativo && id === dono.empresaId) {
            throw invalido("Você não pode inativar a sua própria empresa");
        }

        if (empresa.ativo !== ativo) {
            await this.repo.definirSituacao(id, ativo, ativo ? null : motivo?.trim() || null, dono.usuarioId);

            // vale na próxima requisição de qualquer pessoa da empresa (e derruba o tempo real delas)
            permissaoService.invalidarEmpresa(id);

            log.info({ empresaId: id, ativo, por: dono.usuarioId }, ativo ? "empresa reativada" : "empresa inativada");
        }

        return this.detalhar(id);
    }
}

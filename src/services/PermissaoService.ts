import { PermissaoRepository, UsuarioPermissoes } from "../repositories/PermissaoRepository";
import {
    PAPEIS_GERENCIAVEIS,
    TODAS_PERMISSOES,
    ehPermissaoValida,
    normalizar,
    padraoDoPapel,
    rotuloDe,
} from "../permissoes/catalogo";
import { invalido, naoEncontrado, proibido } from "../utils/erros";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "permissoes" });

/** Perfil de acesso de um usuário, já resolvido (é o que fica em cache). */
export interface Perfil {
    id: number;
    nome: string;
    empresaId: string;
    role: string;
    ativo: boolean;
    permissoes: ReadonlySet<string>;
    expiraEm: number;
}

/** Quem está agindo (vem da requisição já autenticada). */
export interface Ator {
    id: number;
    role: string;
    empresaId: string;
    permissoes: ReadonlySet<string>;
}

// Seguro contra mudança feita por outra instância: mesmo sem invalidação, no máximo isso de atraso.
const TTL_MS = 30_000;
const TODAS = new Set<string>(TODAS_PERMISSOES);

const diferenca = (a: Iterable<string>, b: Iterable<string>): string[] => {
    const cb = new Set(b);
    return [...a].filter((x) => !cb.has(x));
};

export class PermissaoService {

    constructor(private repo = new PermissaoRepository()) {}

    private cache = new Map<number, Perfil>();
    // várias requisições do mesmo usuário ao mesmo tempo compartilham uma única ida ao banco
    private carregando = new Map<number, Promise<Perfil | null>>();

    /* ================= leitura (caminho quente) ================= */

    /** Perfil do usuário: memória na maioria das vezes, banco só quando o cache expira. */
    async perfil(usuarioId: number): Promise<Perfil | null> {
        const noCache = this.cache.get(usuarioId);
        if (noCache && noCache.expiraEm > Date.now()) return noCache;

        const emAndamento = this.carregando.get(usuarioId);
        if (emAndamento) return emAndamento;

        const promessa = this.carregarDoBanco(usuarioId).finally(() => this.carregando.delete(usuarioId));
        this.carregando.set(usuarioId, promessa);
        return promessa;
    }

    private async carregarDoBanco(usuarioId: number): Promise<Perfil | null> {
        let usuario = await this.repo.carregar(usuarioId);
        if (!usuario) {
            this.cache.delete(usuarioId);
            return null;
        }

        // usuário antigo (ou criado direto no banco): recebe o padrão do tipo dele, uma única vez
        if (!usuario.inicializadas && usuario.role !== "ADMIN") {
            await this.repo.inicializarSeNecessario(usuario.id, usuario.empresa_id, [...padraoDoPapel(usuario.role)]);
            usuario = (await this.repo.carregar(usuarioId)) as UsuarioPermissoes;
            log.info({ usuarioId, role: usuario.role }, "permissões iniciais aplicadas");
        }

        const perfil: Perfil = {
            id: usuario.id,
            nome: usuario.nome,
            empresaId: usuario.empresa_id,
            role: usuario.role,
            ativo: usuario.ativo,
            // ADMIN (dono do sistema) tem tudo, sempre
            permissoes: usuario.role === "ADMIN" ? TODAS : new Set(usuario.permissoes),
            expiraEm: Date.now() + TTL_MS,
        };

        this.cache.set(usuarioId, perfil);
        return perfil;
    }

    invalidar(usuarioId: number): void {
        this.cache.delete(usuarioId);
    }

    invalidarTodos(): void {
        this.cache.clear();
    }

    /* ================= gerenciamento ================= */

    private async alvoEditavel(ator: Ator, alvoId: number): Promise<UsuarioPermissoes> {
        if (!ator.permissoes.has("usuarios.gerenciar_permissoes")) {
            throw proibido("Você não tem permissão para gerenciar permissões");
        }

        const alvo = await this.repo.carregarDaEmpresa(alvoId, ator.empresaId);
        if (!alvo) throw naoEncontrado("Usuário não encontrado");

        this.validarAlvo(ator, alvo);
        return alvo;
    }

    /** Quem pode mexer nas permissões de quem. */
    validarAlvo(ator: Pick<Ator, "id" | "role">, alvo: { id: number; role: string }): void {
        if (alvo.id === ator.id) throw proibido("Você não pode alterar as suas próprias permissões");
        if (alvo.role === "ADMIN") throw proibido("O administrador tem acesso total e não pode ser alterado");

        // gestores só gerenciam técnicos e operadores; só o administrador mexe em gestores
        if (ator.role !== "ADMIN" && !PAPEIS_GERENCIAVEIS.includes(alvo.role as never)) {
            throw proibido("Somente o administrador altera as permissões de um gestor");
        }
    }

    async consultar(ator: Ator, alvoId: number) {
        const alvo = await this.alvoEditavel(ator, alvoId);
        const inicializado = await this.perfil(alvoId);

        return {
            usuario: { id: alvo.id, nome: alvo.nome, email: alvo.email, role: alvo.role, ativo: alvo.ativo },
            permissoes: [...(inicializado?.permissoes ?? [])],
            // o que este ator pode ligar/desligar: só o que ele mesmo possui
            concedivel: ator.role === "ADMIN" ? [...TODAS_PERMISSOES] : [...ator.permissoes],
            padrao: [...padraoDoPapel(alvo.role)],
        };
    }

    /**
     * Regra do "teto": quem gerencia só liga/desliga o que ele mesmo tem —
     * senão um gestor limitado conseguiria dar a outro mais poder do que ele próprio possui.
     */
    private conferirTeto(ator: Ator, antes: string[], depois: string[]): void {
        if (ator.role === "ADMIN") return;

        const mudadas = [...diferenca(antes, depois), ...diferenca(depois, antes)];
        const foraDoTeto = mudadas.filter((p) => !ator.permissoes.has(p));

        if (foraDoTeto.length > 0) {
            throw proibido(
                `Você não pode alterar "${rotuloDe(foraDoTeto[0])}" porque você mesmo não possui essa permissão`
            );
        }
    }

    async definir(ator: Ator, alvoId: number, solicitadas: unknown, acao = "definir") {
        const alvo = await this.alvoEditavel(ator, alvoId);

        if (!Array.isArray(solicitadas) || solicitadas.some((p) => typeof p !== "string")) {
            throw invalido("Envie a lista de permissões");
        }

        const desconhecidas = solicitadas.filter((p) => !ehPermissaoValida(p));
        if (desconhecidas.length > 0) {
            throw invalido(`Permissão desconhecida: ${desconhecidas.slice(0, 3).join(", ")}`);
        }

        const { final, adicionadas } = normalizar(solicitadas as string[]);

        // garante que o padrão do tipo já foi aplicado (usuário antigo) antes de comparar
        await this.perfil(alvoId);

        await this.repo.comTransacao(async (cliente) => {
            // trava o funcionário: alterações simultâneas viram uma fila (a última vence)
            await this.repo.travarUsuario(cliente, alvo.id);

            const antes = (await this.repo.permissoesGravadas(cliente, alvo.id)).sort();
            this.conferirTeto(ator, antes, final);

            await this.repo.substituir(alvo.id, alvo.empresa_id, final, cliente);
            await this.repo.registrarAuditoria(
                { empresaId: alvo.empresa_id, alteradoPor: ator.id, usuarioAlvo: alvo.id, acao, antes, depois: final },
                cliente
            );
        });

        this.invalidar(alvoId);

        log.info({ alvoId, por: ator.id, acao, total: final.length }, "permissões alteradas");

        return { permissoes: final, adicionadasPorDependencia: adicionadas };
    }

    /** Volta o funcionário ao padrão do tipo dele (limitado ao que o ator possui). */
    async restaurarPadrao(ator: Ator, alvoId: number) {
        const alvo = await this.repo.carregarDaEmpresa(alvoId, ator.empresaId);
        if (!alvo) throw naoEncontrado("Usuário não encontrado");

        const padrao = [...padraoDoPapel(alvo.role)];
        return this.definir(ator, alvoId, padrao, "restaurar_padrao");
    }

    /**
     * Padrão de um funcionário recém-criado (ou que mudou de tipo). Quem cria só entrega
     * o que possui (teto). Não exige "gerenciar_permissoes": criar usuário já tem sua própria permissão.
     */
    async aplicarPadraoAoCriar(ator: Pick<Ator, "id" | "role" | "permissoes">, alvo: { id: number; role: string; empresaId: string }, acao = "criacao") {
        const base = [...padraoDoPapel(alvo.role)];
        const limitado = ator.role === "ADMIN" ? base : base.filter((p) => ator.permissoes.has(p));
        const { final } = normalizar(limitado);

        const antes = await this.repo.carregar(alvo.id);

        await this.repo.comTransacao(async (cliente) => {
            await this.repo.travarUsuario(cliente, alvo.id);
            await this.repo.substituir(alvo.id, alvo.empresaId, final, cliente);
            await this.repo.registrarAuditoria(
                {
                    empresaId: alvo.empresaId,
                    alteradoPor: ator.id,
                    usuarioAlvo: alvo.id,
                    acao,
                    antes: antes?.permissoes ?? [],
                    depois: final,
                },
                cliente
            );
        });

        this.invalidar(alvo.id);
        return final;
    }

    async auditoria(ator: Ator, limite: number, usuarioAlvo?: number) {
        if (!ator.permissoes.has("usuarios.gerenciar_permissoes")) {
            throw proibido("Você não tem permissão para ver o histórico de permissões");
        }

        return this.repo.listarAuditoria(ator.empresaId, limite, usuarioAlvo);
    }
}

export const permissaoService = new PermissaoService();


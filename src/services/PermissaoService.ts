import { PermissaoRepository, UsuarioPermissoes } from "../repositories/PermissaoRepository";
import {
    PAPEIS_GERENCIAVEIS,
    TODAS_PERMISSOES,
    ehPermissaoValida,
    normalizar,
    padraoDoPapel,
    sanearPorPapel,
    VEDADAS_AO_GESTOR,
    podar,
    rotuloDe,
} from "../permissoes/catalogo";
import { invalido, naoEncontrado, proibido } from "../utils/erros";
import { logger } from "../config/logger";
import { reavaliarUsuario } from "../realtime/wsBus";

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

export type AcaoEmGrupo = "dar" | "retirar";

export interface PedidoEmGrupo {
    acao: AcaoEmGrupo;
    permissoes: string[];
    /** ou todos de um tipo, ou uma lista de funcionários */
    alvo: { tipo: string } | { usuarios: number[] };
}

export interface ResultadoEmGrupo {
    simulado: boolean;
    /** quantos funcionários o pedido alcança */
    total: number;
    alterados: { id: number; nome: string }[];
    ignorados: { id: number; nome: string; motivo: "ajuste_individual" | "sem_mudanca" | "fora_do_seu_limite" }[];
}

// Seguro contra mudança feita por outra instância: mesmo sem invalidação, no máximo isso de atraso.
const TTL_MS = 30_000;
const TODAS = new Set<string>(TODAS_PERMISSOES);

const diferenca = (a: Iterable<string>, b: Iterable<string>): string[] => {
    const cb = new Set(b);
    return [...a].filter((x) => !cb.has(x));
};

/** Descarta chaves que não existem mais no catálogo (ex.: funcionalidades retiradas). */
const soValidas = (lista: Iterable<string>): string[] => [...lista].filter(ehPermissaoValida);

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
            permissoes: usuario.role === "ADMIN" ? TODAS : new Set(sanearPorPapel(usuario.role, soValidas(usuario.permissoes))),
            expiraEm: Date.now() + TTL_MS,
        };

        this.cache.set(usuarioId, perfil);
        return perfil;
    }

    invalidar(usuarioId: number): void {
        this.cache.delete(usuarioId);
        // conexões de tempo real desse usuário nascem com as permissões antigas: refaz
        reavaliarUsuario(usuarioId);
    }

    invalidarTodos(): void {
        this.cache.clear();
    }

    /* ================= gerenciamento individual ================= */

    private async alvoEditavel(ator: Ator, alvoId: number): Promise<UsuarioPermissoes> {
        this.exigirGerenciar(ator);

        const alvo = await this.repo.carregarDaEmpresa(alvoId, ator.empresaId);
        if (!alvo) throw naoEncontrado("Usuário não encontrado");

        this.validarAlvo(ator, alvo);
        return alvo;
    }

    private exigirGerenciar(ator: Ator): void {
        if (!ator.permissoes.has("usuarios.gerenciar_permissoes")) {
            throw proibido("Você não tem permissão para gerenciar permissões");
        }
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
        const perfil = await this.perfil(alvoId);

        return {
            usuario: { id: alvo.id, nome: alvo.nome, email: alvo.email, role: alvo.role, ativo: alvo.ativo },
            permissoes: [...(perfil?.permissoes ?? [])],
            // true = ajuste individual: as alterações em grupo não mexem neste funcionário
            personalizado: alvo.personalizadas,
            // o que este ator pode ligar/desligar: só o que ele mesmo possui
            concedivel: [...this.tetoDe(ator)],
            padrao: [...padraoDoPapel(alvo.role)],
        };
    }

    /**
     * O que este ator pode conceder/retirar. Em geral, o que ele mesmo possui; o gestor também pode
     * configurar a EXECUÇÃO (assumir/iniciar/pausar) dos técnicos dele, mesmo não executando (não faz manutenção).
     */
    private tetoDe(ator: Pick<Ator, "role" | "permissoes">): ReadonlySet<string> {
        if (ator.role === "ADMIN") return new Set(TODAS_PERMISSOES);
        if (ator.role === "GESTOR") return new Set([...ator.permissoes, ...VEDADAS_AO_GESTOR]);
        return ator.permissoes;
    }

    /**
     * Regra do "teto": quem gerencia só liga/desliga o que ele mesmo tem —
     * senão um gestor limitado conseguiria dar a outro mais poder do que ele próprio possui.
     */
    private foraDoTeto(ator: Ator, antes: string[], depois: string[]): string | null {
        if (ator.role === "ADMIN") return null;

        const mudadas = [...diferenca(antes, depois), ...diferenca(depois, antes)];
        const teto = this.tetoDe(ator);
        return mudadas.find((p) => !teto.has(p)) ?? null;
    }

    private conferirTeto(ator: Ator, antes: string[], depois: string[]): void {
        const fora = this.foraDoTeto(ator, antes, depois);

        if (fora) {
            throw proibido(`Você não pode alterar "${rotuloDe(fora)}" porque você mesmo não possui essa permissão`);
        }
    }

    /**
     * Define as permissões de UM funcionário (o painel da linha).
     * `personalizada` true = ajuste individual, que tem prioridade sobre as alterações em grupo;
     * false = o funcionário volta a seguir o padrão/grupo.
     */
    async definir(ator: Ator, alvoId: number, solicitadas: unknown, acao = "definir", personalizada = true) {
        const alvo = await this.alvoEditavel(ator, alvoId);

        if (!Array.isArray(solicitadas) || solicitadas.some((p) => typeof p !== "string")) {
            throw invalido("Envie a lista de permissões");
        }

        const desconhecidas = solicitadas.filter((p) => !ehPermissaoValida(p));
        if (desconhecidas.length > 0) {
            throw invalido(`Permissão desconhecida: ${desconhecidas.slice(0, 3).join(", ")}`);
        }

        const { final: finalBruto, adicionadas } = normalizar(solicitadas as string[]);
        // o que o tipo do funcionário não pode ter (ex.: gestor não assume O.S.) é descartado em silêncio
        const final = sanearPorPapel(alvo.role, finalBruto);

        // garante que o padrão do tipo já foi aplicado (usuário antigo) antes de comparar
        await this.perfil(alvoId);

        await this.repo.comTransacao(async (cliente) => {
            // trava o funcionário: alterações simultâneas viram uma fila (a última vence)
            await this.repo.travarUsuario(cliente, alvo.id);

            const antes = soValidas(await this.repo.permissoesGravadas(cliente, alvo.id)).sort();
            this.conferirTeto(ator, antes, final);

            await this.repo.substituir(alvo.id, alvo.empresa_id, final, cliente, personalizada);
            await this.repo.registrarAuditoria(
                { empresaId: alvo.empresa_id, alteradoPor: ator.id, usuarioAlvo: alvo.id, acao, antes, depois: final },
                cliente
            );
        });

        this.invalidar(alvoId);

        log.info({ alvoId, por: ator.id, acao, total: final.length, personalizada }, "permissões alteradas");

        return { permissoes: final, adicionadasPorDependencia: adicionadas };
    }

    /** Volta o funcionário ao padrão do tipo dele (e a seguir o grupo), limitado ao que o ator possui. */
    async restaurarPadrao(ator: Ator, alvoId: number) {
        const alvo = await this.repo.carregarDaEmpresa(alvoId, ator.empresaId);
        if (!alvo) throw naoEncontrado("Usuário não encontrado");

        const padrao = [...padraoDoPapel(alvo.role)];
        return this.definir(ator, alvoId, padrao, "restaurar_padrao", false);
    }

    /**
     * Padrão de um funcionário recém-criado (ou que mudou de tipo). Quem cria só entrega
     * o que possui (teto). Não exige "gerenciar_permissoes": criar usuário já tem sua própria permissão.
     */
    async aplicarPadraoAoCriar(ator: Pick<Ator, "id" | "role" | "permissoes">, alvo: { id: number; role: string; empresaId: string }, acao = "criacao") {
        const base = [...padraoDoPapel(alvo.role)];
        const limitado = sanearPorPapel(alvo.role, ator.role === "ADMIN" ? base : base.filter((p) => this.tetoDe(ator).has(p)));
        const { final } = normalizar(limitado);

        const antes = await this.repo.carregar(alvo.id);

        await this.repo.comTransacao(async (cliente) => {
            await this.repo.travarUsuario(cliente, alvo.id);
            await this.repo.substituir(alvo.id, alvo.empresaId, final, cliente, false);
            await this.repo.registrarAuditoria(
                {
                    empresaId: alvo.empresaId,
                    alteradoPor: ator.id,
                    usuarioAlvo: alvo.id,
                    acao,
                    antes: soValidas(antes?.permissoes ?? []),
                    depois: final,
                },
                cliente
            );
        });

        this.invalidar(alvo.id);
        return final;
    }

    /* ================= gerenciamento em grupo ================= */

    /**
     * Dá ou retira permissões de VÁRIOS funcionários de uma vez — por tipo (todos os técnicos,
     * todos os operadores) ou por seleção. Regras:
     *  - só o que o gestor mesmo possui (teto) e só em quem ele pode gerenciar;
     *  - quem tem ajuste individual é IGNORADO (o individual tem prioridade sobre o grupo);
     *  - "dar" completa as dependências; "retirar" leva junto o que dependia do que saiu;
     *  - `simular` devolve o que aconteceria, sem gravar nada.
     */
    async aplicarEmGrupo(ator: Ator, pedido: PedidoEmGrupo, simular = false): Promise<ResultadoEmGrupo> {
        this.exigirGerenciar(ator);

        if (!["dar", "retirar"].includes(pedido.acao)) throw invalido("Ação inválida");

        const pedidas = [...new Set(pedido.permissoes)];
        if (pedidas.length === 0) throw invalido("Escolha ao menos uma permissão");

        const desconhecidas = pedidas.filter((p) => !ehPermissaoValida(p));
        if (desconhecidas.length > 0) throw invalido(`Permissão desconhecida: ${desconhecidas.slice(0, 3).join(", ")}`);

        // o gestor só concede/retira o que ele mesmo tem (as dependências que de fato forem
        // acrescentadas a alguém são conferidas funcionário por funcionário, abaixo)
        this.conferirTeto(ator, [], pedidas);

        const ids = await this.resolverAlvos(ator, pedido.alvo);
        const resultado: ResultadoEmGrupo = { simulado: simular, total: ids.length, alterados: [], ignorados: [] };

        if (ids.length === 0) return resultado;

        const pendentes: { id: number; antes: string[]; depois: string[] }[] = [];

        await this.repo.comTransacao(async (cliente) => {
            const usuarios = await this.repo.travarECarregarVarios(cliente, ids, ator.empresaId);

            // selecionou alguém que não é desta empresa (ou não existe)
            if (usuarios.length !== ids.length) throw naoEncontrado("Usuário não encontrado");

            for (const u of usuarios) {
                // seleção explícita não pode incluir quem este ator não gerencia
                this.validarAlvo(ator, u);

                if (u.personalizadas) {
                    resultado.ignorados.push({ id: u.id, nome: u.nome, motivo: "ajuste_individual" });
                    continue;
                }

                // usuário antigo ainda sem permissões gravadas: parte do padrão do tipo
                const antes = (u.inicializadas ? soValidas(u.permissoes) : [...padraoDoPapel(u.role)]).sort();

                // dar: completa as dependências sobre o que a pessoa JÁ tem (quem vê todas as O.S. não
                // ganha "só as minhas" à toa); retirar: leva junto o que dependia do que saiu
                const depois = sanearPorPapel(
                    u.role,
                    pedido.acao === "dar"
                        ? normalizar([...antes, ...pedidas]).final
                        : podar(diferenca(antes, pedidas))
                );

                const semMudanca = antes.length === depois.length && antes.every((p) => depois.includes(p));
                if (semMudanca) {
                    resultado.ignorados.push({ id: u.id, nome: u.nome, motivo: "sem_mudanca" });
                    continue;
                }

                if (this.foraDoTeto(ator, antes, depois)) {
                    resultado.ignorados.push({ id: u.id, nome: u.nome, motivo: "fora_do_seu_limite" });
                    continue;
                }

                pendentes.push({ id: u.id, antes, depois });
                resultado.alterados.push({ id: u.id, nome: u.nome });
            }

            if (!simular) {
                // tudo de uma vez (3 comandos + 1 de registro, não importa quantos funcionários)
                // e sem mexer na marca de "ajuste individual"
                await this.repo.substituirVarios(
                    cliente,
                    ator.empresaId,
                    pendentes.map((p) => ({ id: p.id, permissoes: p.depois }))
                );
                await this.repo.registrarAuditoriaVarios(cliente, {
                    empresaId: ator.empresaId,
                    alteradoPor: ator.id,
                    acao: pedido.acao === "dar" ? "grupo_dar" : "grupo_retirar",
                    itens: pendentes.map((p) => ({ usuarioAlvo: p.id, antes: p.antes, depois: p.depois })),
                });
            }
        });

        if (!simular) for (const p of pendentes) this.invalidar(p.id);

        log.info(
            { por: ator.id, acao: pedido.acao, alterados: resultado.alterados.length, ignorados: resultado.ignorados.length, simular },
            "permissões em grupo"
        );

        return resultado;
    }

    /** Transforma o alvo do pedido (tipo ou lista) na lista de ids, já conferindo a hierarquia. */
    private async resolverAlvos(ator: Ator, alvo: PedidoEmGrupo["alvo"]): Promise<number[]> {
        if ("tipo" in alvo) {
            const permitidos = ator.role === "ADMIN" ? ["GESTOR", ...PAPEIS_GERENCIAVEIS] : [...PAPEIS_GERENCIAVEIS];

            if (!permitidos.includes(alvo.tipo as never)) {
                throw proibido("Somente o administrador altera as permissões de gestores");
            }

            return (await this.repo.idsPorTipo(ator.empresaId, alvo.tipo)).filter((id) => id !== ator.id);
        }

        return [...new Set(alvo.usuarios)];
    }
}

export const permissaoService = new PermissaoService();

/**
 * Catálogo de permissões — única fonte da verdade (o front busca tudo daqui via
 * GET /permissoes/catalogo, então rótulos e dependências nunca ficam duplicados).
 *
 * Organização: um MÓDULO por tela do sistema; dentro dele, as AÇÕES (funcionalidades)
 * da tela. A chave de uma permissão é "modulo.acao".
 */

export type Papel = "ADMIN" | "GESTOR" | "TECNICO" | "OPERADOR";

export interface AcaoDef {
    chave: string; // só a ação, ex.: "criar"
    rotulo: string;
    descricao: string;
    /** permissões que precisam estar ligadas junto (todas) */
    requer?: string[];
    /** basta uma destas; se nenhuma estiver ligada, a primeira é adicionada (menor privilégio) */
    requerUmDe?: string[];
}

export interface ModuloDef {
    chave: string;
    rotulo: string;
    descricao: string;
    /** permissão que representa "acessar a tela" (liga/desliga o menu) */
    acesso: string;
    acoes: AcaoDef[];
}

const VER_OS = ["os.ver_proprias", "os.ver"];

export const CATALOGO: ModuloDef[] = [
    {
        chave: "dashboard",
        rotulo: "Dashboard",
        descricao: "Indicadores gerais da empresa",
        acesso: "dashboard.ver_gestor",
        acoes: [
            {
                chave: "ver_gestor",
                rotulo: "Ver o dashboard do gestor",
                descricao: "KPIs, custos, ranking de técnicos e alertas de toda a empresa",
            },
        ],
    },
    {
        chave: "maquinas",
        rotulo: "Máquinas",
        descricao: "Cadastro e detalhes das máquinas",
        acesso: "maquinas.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver máquinas", descricao: "Lista e detalhes das máquinas" },
            { chave: "criar", rotulo: "Cadastrar", descricao: "Cadastrar novas máquinas", requer: ["maquinas.ver"] },
            { chave: "editar", rotulo: "Editar", descricao: "Alterar dados e imagem da máquina", requer: ["maquinas.ver"] },
            { chave: "excluir", rotulo: "Excluir", descricao: "Apagar máquinas", requer: ["maquinas.ver"] },
            { chave: "alterar_status", rotulo: "Ativar / inativar", descricao: "Mudar o status da máquina", requer: ["maquinas.ver"] },
        ],
    },
    {
        chave: "os",
        rotulo: "Ordens de serviço",
        descricao: "Abertura e acompanhamento das manutenções",
        acesso: "os.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver todas as O.S.", descricao: "Enxerga as ordens de serviço de toda a empresa" },
            { chave: "ver_proprias", rotulo: "Ver só as minhas O.S.", descricao: "Enxerga apenas as que abriu ou que são dele" },
            { chave: "criar", rotulo: "Abrir O.S.", descricao: "Abrir novas ordens de serviço", requerUmDe: VER_OS },
            { chave: "atribuir", rotulo: "Atribuir a um técnico", descricao: "Designar a O.S. a qualquer técnico", requerUmDe: VER_OS },
            { chave: "assumir", rotulo: "Assumir O.S.", descricao: "Pegar uma O.S. aberta para si mesmo", requerUmDe: VER_OS },
            { chave: "iniciar", rotulo: "Iniciar atendimento", descricao: "Iniciar o atendimento da O.S.", requerUmDe: VER_OS },
            { chave: "pausar", rotulo: "Pausar e retomar", descricao: "Pausar o atendimento (com o motivo) e retomar depois", requerUmDe: VER_OS },
            { chave: "finalizar", rotulo: "Finalizar", descricao: "Encerrar a O.S. com a resolução e os custos", requerUmDe: VER_OS },
            { chave: "cancelar", rotulo: "Cancelar", descricao: "Cancelar ordens de serviço", requerUmDe: VER_OS },
            {
                chave: "definir_externo",
                rotulo: "Definir técnico externo",
                descricao: "Marcar que a O.S. será executada por um parceiro",
                requer: ["os.agir_em_qualquer"],
            },
            {
                chave: "agir_em_qualquer",
                rotulo: "Agir em O.S. de outros",
                descricao: "Iniciar e finalizar também as O.S. que são de outro técnico ou externas",
                requerUmDe: VER_OS,
            },
        ],
    },
    {
        chave: "monitoramento",
        rotulo: "Monitoramento",
        descricao: "Telemetria em tempo real e alertas",
        acesso: "monitoramento.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver monitoramento", descricao: "Telemetria, alertas e histórico das máquinas" },
            { chave: "configurar_limites", rotulo: "Configurar limites", descricao: "Definir limites de atenção e alarme", requer: ["monitoramento.ver"] },
            { chave: "resolver_alertas", rotulo: "Resolver alertas", descricao: "Marcar alertas como resolvidos", requer: ["monitoramento.ver"] },
            { chave: "abrir_os", rotulo: "Abrir O.S. pelo alerta", descricao: "Gerar uma O.S. a partir de um alerta", requer: ["monitoramento.ver", "os.criar"] },
        ],
    },
    {
        chave: "setores",
        rotulo: "Setores",
        descricao: "Setores da fábrica",
        acesso: "setores.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver setores", descricao: "Lista de setores" },
            { chave: "criar", rotulo: "Cadastrar", descricao: "Cadastrar setores", requer: ["setores.ver"] },
            { chave: "editar", rotulo: "Editar", descricao: "Alterar setores", requer: ["setores.ver"] },
            { chave: "excluir", rotulo: "Excluir", descricao: "Apagar setores", requer: ["setores.ver"] },
        ],
    },
    {
        chave: "parceiros",
        rotulo: "Parceiros",
        descricao: "Empresas parceiras / técnicos externos",
        acesso: "parceiros.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver parceiros", descricao: "Lista de parceiros" },
            { chave: "criar", rotulo: "Cadastrar", descricao: "Cadastrar parceiros", requer: ["parceiros.ver"] },
            { chave: "editar", rotulo: "Editar", descricao: "Alterar parceiros", requer: ["parceiros.ver"] },
            { chave: "excluir", rotulo: "Excluir", descricao: "Apagar parceiros", requer: ["parceiros.ver"] },
        ],
    },
    {
        chave: "usuarios",
        rotulo: "Usuários",
        descricao: "Funcionários da empresa",
        acesso: "usuarios.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver usuários", descricao: "Lista de funcionários" },
            { chave: "criar", rotulo: "Cadastrar", descricao: "Cadastrar técnicos e operadores", requer: ["usuarios.ver"] },
            { chave: "editar", rotulo: "Editar", descricao: "Alterar dados de técnicos e operadores", requer: ["usuarios.ver"] },
            { chave: "excluir", rotulo: "Excluir", descricao: "Apagar técnicos e operadores", requer: ["usuarios.ver"] },
            { chave: "alterar_status", rotulo: "Ativar / desativar", descricao: "Bloquear ou liberar o acesso de um funcionário", requer: ["usuarios.ver"] },
            {
                chave: "gerenciar_permissoes",
                rotulo: "Gerenciar permissões",
                descricao: "Definir o que cada técnico e operador pode acessar e fazer",
                requer: ["usuarios.ver"],
            },
        ],
    },
    {
        chave: "relatorios",
        rotulo: "Relatórios",
        descricao: "Histórico de O.S. e indicadores",
        acesso: "relatorios.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver relatórios", descricao: "Pré-visualizar relatórios" },
            { chave: "exportar", rotulo: "Exportar", descricao: "Baixar os relatórios em Excel", requer: ["relatorios.ver"] },
        ],
    },
    {
        chave: "anexos",
        rotulo: "Anexos",
        descricao: "Fotos e documentos de máquinas e O.S.",
        acesso: "anexos.ver",
        acoes: [
            { chave: "ver", rotulo: "Ver anexos", descricao: "Ver fotos e documentos" },
            { chave: "enviar", rotulo: "Enviar", descricao: "Enviar arquivos", requer: ["anexos.ver"] },
            { chave: "excluir", rotulo: "Excluir", descricao: "Apagar arquivos", requer: ["anexos.ver"] },
        ],
    },
];

/* ============ derivados ============ */

const pares = CATALOGO.flatMap((m) => m.acoes.map((a) => ({ chave: `${m.chave}.${a.chave}`, def: a, modulo: m })));

/** todas as chaves válidas, ex.: "os.cancelar" */
export const TODAS_PERMISSOES: readonly string[] = pares.map((p) => p.chave);

const validas = new Set(TODAS_PERMISSOES);

export const ehPermissaoValida = (chave: string): boolean => validas.has(chave);

const defPorChave = new Map(pares.map((p) => [p.chave, p]));

export const rotuloDe = (chave: string): string => {
    const p = defPorChave.get(chave);
    return p ? `${p.modulo.rotulo} › ${p.def.rotulo}` : chave;
};

/**
 * Completa o conjunto com as dependências (ex.: "os.cancelar" traz "os.ver_proprias").
 * Nunca remove nada. Devolve o conjunto final e o que foi adicionado.
 */
export function normalizar(entrada: Iterable<string>): { final: string[]; adicionadas: string[] } {
    const conjunto = new Set(entrada);
    const original = new Set(conjunto);

    let mudou = true;
    while (mudou) {
        mudou = false;

        for (const chave of [...conjunto]) {
            const def = defPorChave.get(chave)?.def;
            if (!def) continue;

            for (const dep of def.requer ?? []) {
                if (!conjunto.has(dep)) {
                    conjunto.add(dep);
                    mudou = true;
                }
            }

            if (def.requerUmDe && !def.requerUmDe.some((d) => conjunto.has(d))) {
                conjunto.add(def.requerUmDe[0]);
                mudou = true;
            }
        }
    }

    const ordem = new Map(TODAS_PERMISSOES.map((k, i) => [k, i]));
    const final = [...conjunto].sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));

    return { final, adicionadas: final.filter((k) => !original.has(k)) };
}

/**
 * Remove o que perdeu uma dependência (o contrário de normalizar), até estabilizar.
 * Ex.: sem "maquinas.ver", caem "maquinas.criar", "maquinas.editar"...
 */
export function podar(entrada: Iterable<string>): string[] {
    const conjunto = new Set(entrada);

    let mudou = true;
    while (mudou) {
        mudou = false;

        for (const chave of [...conjunto]) {
            const def = defPorChave.get(chave)?.def;
            if (!def) continue;

            const faltaTodas = (def.requer ?? []).some((d) => !conjunto.has(d));
            const faltaUma = !!def.requerUmDe && !def.requerUmDe.some((d) => conjunto.has(d));

            if (faltaTodas || faltaUma) {
                conjunto.delete(chave);
                mudou = true;
            }
        }
    }

    const ordem = new Map(TODAS_PERMISSOES.map((k, i) => [k, i]));
    return [...conjunto].sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));
}

/* ============ padrões por tipo de funcionário ============ */

const so = (...chaves: string[]) => normalizar(chaves).final;

/**
 * Regra do sistema: o gestor não faz manutenção. Ele não assume, não inicia e não pausa/retoma O.S.
 * (isso é do técnico); atribui a um técnico ou a um parceiro externo, cancela e finaliza.
 */
export const VEDADAS_AO_GESTOR: readonly string[] = ["os.assumir", "os.iniciar", "os.pausar"];

/** Permissões que um tipo de funcionário não pode ter, mesmo que alguém tente conceder. */
export function vedadasAoPapel(papel: string): readonly string[] {
    return papel === "GESTOR" ? VEDADAS_AO_GESTOR : [];
}

/** Tira da lista o que o tipo não pode ter. */
export function sanearPorPapel(papel: string, lista: Iterable<string>): string[] {
    const vedadas = vedadasAoPapel(papel);
    return [...lista].filter((p) => !vedadas.includes(p));
}

/** Ponto de partida de cada tipo — reproduz o que cada um já podia fazer antes do sistema de permissões. */
export const PADRAO_POR_PAPEL: Record<Exclude<Papel, "ADMIN">, readonly string[]> = {
    // o gestor atribui (a um técnico ou a um parceiro externo); quem assume a O.S. é o técnico
    GESTOR: TODAS_PERMISSOES.filter((p) => !VEDADAS_AO_GESTOR.includes(p)),

    TECNICO: so(
        "maquinas.ver",
        "os.ver", "os.criar", "os.assumir", "os.iniciar", "os.pausar", "os.finalizar",
        "monitoramento.ver", "monitoramento.resolver_alertas", "monitoramento.abrir_os",
        "setores.ver",
        "parceiros.ver",
        "anexos.ver", "anexos.enviar"
    ),

    OPERADOR: so(
        "maquinas.ver",
        "os.ver", "os.criar",
        "monitoramento.ver",
        "setores.ver",
        "parceiros.ver",
        "anexos.ver", "anexos.enviar"
    ),
};

export const PAPEIS_GERENCIAVEIS: readonly Papel[] = ["TECNICO", "OPERADOR"];

export function padraoDoPapel(papel: string): readonly string[] {
    if (papel === "ADMIN") return TODAS_PERMISSOES;
    return PADRAO_POR_PAPEL[papel as Exclude<Papel, "ADMIN">] ?? [];
}

/**
 * Leituras de apoio: uma tela consome dados de outra (a de Máquinas carrega Setores,
 * a de O.S. carrega Máquinas e técnicos...). Nesses endpoints vale a permissão do
 * próprio módulo OU a de qualquer tela que precisa daqueles dados — assim liberar uma
 * tela nunca quebra outra.
 */
export const LEITURA_DE_APOIO = {
    maquinas: ["maquinas.ver", "os.ver", "os.ver_proprias", "os.criar", "relatorios.ver", "monitoramento.ver"],
    setores: ["setores.ver", "maquinas.ver", "relatorios.ver"],
    parceiros: ["parceiros.ver", "os.finalizar", "os.definir_externo", "relatorios.ver"],
    tecnicos: ["usuarios.ver", "os.atribuir", "os.ver", "os.ver_proprias"],
} as const;

/** Formato entregue ao front (GET /permissoes/catalogo). */
export function catalogoParaApi() {
    return {
        modulos: CATALOGO.map((m) => ({
            chave: m.chave,
            rotulo: m.rotulo,
            descricao: m.descricao,
            acesso: m.acesso,
            acoes: m.acoes.map((a) => ({
                permissao: `${m.chave}.${a.chave}`,
                rotulo: a.rotulo,
                descricao: a.descricao,
                requer: a.requer ?? [],
                requerUmDe: a.requerUmDe ?? [],
            })),
        })),
        // permissões que o tipo não pode ter (a tela esconde essas opções)
        vedadas: { GESTOR: VEDADAS_AO_GESTOR, TECNICO: [], OPERADOR: [] },
        padroes: {
            GESTOR: PADRAO_POR_PAPEL.GESTOR,
            TECNICO: PADRAO_POR_PAPEL.TECNICO,
            OPERADOR: PADRAO_POR_PAPEL.OPERADOR,
        },
    };
}

import { describe, expect, it } from "vitest";
import {
    CATALOGO,
    LEITURA_DE_APOIO,
    PADRAO_POR_PAPEL,
    TODAS_PERMISSOES,
    catalogoParaApi,
    ehPermissaoValida,
    normalizar,
    padraoDoPapel,
} from "../src/permissoes/catalogo";

/** Testes puros do catálogo (não usam banco): garantem a consistência das regras. */

describe("catálogo de permissões", () => {
    it("chaves únicas, no formato modulo.acao", () => {
        expect(new Set(TODAS_PERMISSOES).size).toBe(TODAS_PERMISSOES.length);
        for (const chave of TODAS_PERMISSOES) expect(chave).toMatch(/^[a-z_]+\.[a-z_]+$/);
    });

    it("todo módulo tem a permissão de acesso e ela existe", () => {
        for (const m of CATALOGO) {
            expect(ehPermissaoValida(m.acesso), `${m.chave} → ${m.acesso}`).toBe(true);
            expect(m.acesso.startsWith(`${m.chave}.`)).toBe(true);
        }
    });

    it("toda dependência aponta pra uma permissão que existe", () => {
        for (const m of CATALOGO) {
            for (const a of m.acoes) {
                for (const dep of [...(a.requer ?? []), ...(a.requerUmDe ?? [])]) {
                    expect(ehPermissaoValida(dep), `${m.chave}.${a.chave} requer ${dep}`).toBe(true);
                }
            }
        }
    });

    it("dependências não formam ciclo (normalizar sempre termina)", () => {
        const { final } = normalizar(TODAS_PERMISSOES);
        expect(final.length).toBe(TODAS_PERMISSOES.length);
    });

    it("leituras de apoio só citam permissões que existem", () => {
        for (const lista of Object.values(LEITURA_DE_APOIO)) {
            for (const p of lista) expect(ehPermissaoValida(p), p).toBe(true);
        }
    });

    it("ações de escrita sempre exigem poder ver o módulo", () => {
        for (const m of CATALOGO) {
            if (m.chave === "dashboard") continue;
            for (const a of m.acoes) {
                const chave = `${m.chave}.${a.chave}`;
                if (a.chave.startsWith("ver")) continue;
                const { final } = normalizar([chave]);
                const temAcesso = final.some((p) => p === m.acesso || p === `${m.chave}.ver_proprias`);
                expect(temAcesso, `${chave} deveria trazer o acesso ao módulo`).toBe(true);
            }
        }
    });
});

describe("normalizar (dependências automáticas)", () => {
    it("cancelar O.S. traz 'ver só as minhas' (menor privilégio), não 'ver todas'", () => {
        const { final, adicionadas } = normalizar(["os.cancelar"]);
        expect(final).toContain("os.ver_proprias");
        expect(final).not.toContain("os.ver");
        expect(adicionadas).toEqual(["os.ver_proprias"]);
    });

    it("se já vê todas, não adiciona nada", () => {
        expect(normalizar(["os.ver", "os.cancelar"]).adicionadas).toEqual([]);
    });

    it("definir externo traz agir em O.S. de outros (o gestor não inicia: quem define o externo não precisa de 'iniciar')", () => {
        const { final } = normalizar(["os.definir_externo"]);
        expect(final).toEqual(expect.arrayContaining(["os.agir_em_qualquer", "os.ver_proprias"]));
        expect(final).not.toContain("os.iniciar");
    });

    it("abrir O.S. pelo alerta traz ver monitoramento e abrir O.S.", () => {
        const { final } = normalizar(["monitoramento.abrir_os"]);
        expect(final).toEqual(expect.arrayContaining(["monitoramento.ver", "os.criar", "os.ver_proprias"]));
    });

    it("editar máquina traz ver máquinas; conjunto vazio continua vazio", () => {
        expect(normalizar(["maquinas.editar"]).final).toEqual(["maquinas.ver", "maquinas.editar"]);
        expect(normalizar([]).final).toEqual([]);
    });

    it("é idempotente e mantém a ordem do catálogo", () => {
        const um = normalizar(["os.finalizar", "maquinas.excluir"]).final;
        expect(normalizar(um).final).toEqual(um);
        const ordem = TODAS_PERMISSOES.filter((p) => um.includes(p));
        expect(um).toEqual(ordem);
    });
});

describe("padrões por tipo de funcionário", () => {
    it("todo padrão é válido e já está completo (normalizar não muda)", () => {
        for (const papel of ["GESTOR", "TECNICO", "OPERADOR"] as const) {
            const padrao = [...PADRAO_POR_PAPEL[papel]];
            for (const p of padrao) expect(ehPermissaoValida(p)).toBe(true);
            expect(normalizar(padrao).adicionadas, papel).toEqual([]);
        }
    });

    it("admin (dono) tem tudo; gestor tem tudo MENOS assumir/iniciar/pausar (não faz manutenção)", () => {
        expect(padraoDoPapel("ADMIN").length).toBe(TODAS_PERMISSOES.length);

        const vedadas = ["os.assumir", "os.iniciar", "os.pausar"];
        const gestor = padraoDoPapel("GESTOR");
        expect(gestor.length).toBe(TODAS_PERMISSOES.length - vedadas.length);
        for (const p of vedadas) expect(gestor).not.toContain(p);
        for (const p of ["os.atribuir", "os.cancelar", "os.finalizar", "os.definir_externo", "os.agir_em_qualquer"]) expect(gestor).toContain(p);
    });

    it("técnico e operador NÃO têm acesso a Usuários nem Relatórios, nem podem cancelar O.S.", () => {
        for (const papel of ["TECNICO", "OPERADOR"]) {
            const p = padraoDoPapel(papel);
            expect(p.some((x) => x.startsWith("usuarios."))).toBe(false);
            expect(p.some((x) => x.startsWith("relatorios."))).toBe(false);
            expect(p).not.toContain("os.cancelar");
            expect(p).not.toContain("os.atribuir");
            expect(p).not.toContain("os.agir_em_qualquer");
            expect(p).not.toContain("dashboard.ver_gestor");
        }
    });

    it("técnico executa O.S. (assumir/iniciar/finalizar); operador só abre", () => {
        expect(padraoDoPapel("TECNICO")).toEqual(expect.arrayContaining(["os.assumir", "os.iniciar", "os.finalizar"]));
        expect(padraoDoPapel("OPERADOR")).toEqual(expect.arrayContaining(["os.ver", "os.criar"]));
        expect(padraoDoPapel("OPERADOR")).not.toContain("os.iniciar");
    });

    it("tipo desconhecido não recebe nada", () => {
        expect(padraoDoPapel("QUALQUER")).toEqual([]);
    });
});

describe("catálogo entregue ao front", () => {
    it("traz módulos, ações com rótulo e os padrões", () => {
        const api = catalogoParaApi();
        expect(api.modulos.length).toBe(CATALOGO.length);
        for (const m of api.modulos) {
            expect(m.rotulo).toBeTruthy();
            for (const a of m.acoes) {
                expect(a.rotulo).toBeTruthy();
                expect(a.descricao).toBeTruthy();
                expect(a.permissao.startsWith(`${m.chave}.`)).toBe(true);
            }
        }
        expect(Object.keys(api.padroes).sort()).toEqual(["GESTOR", "OPERADOR", "TECNICO"]);
    });
});

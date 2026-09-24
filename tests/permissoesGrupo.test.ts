import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { PADRAO_POR_PAPEL, TODAS_PERMISSOES } from "../src/permissoes/catalogo";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Permissões em grupo (por tipo ou por seleção) e a regra de prioridade:
 * o AJUSTE INDIVIDUAL (painel da linha) vale mais que o grupo — quem tem ajuste individual
 * é ignorado pelas alterações em grupo.
 */

let fx: Fixture;

const com = (token: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  put: (url: string, corpo?: object) => request(app).put(url).set("Authorization", `Bearer ${token}`).send(corpo),
  post: (url: string, corpo?: object) => request(app).post(url).set("Authorization", `Bearer ${token}`).send(corpo),
});

const gestor = () => com(fx.A.tokenGestor);
const admin = () => com(fx.A.tokenAdmin);

const semPerm = (...retirar: string[]) => TODAS_PERMISSOES.filter((p) => !retirar.includes(p));
const permissoesDe = async (id: number): Promise<string[]> =>
  (await pool.query(`SELECT permissao FROM usuario_permissoes WHERE usuario_id = $1 ORDER BY permissao`, [id])).rows.map((r) => r.permissao);
const personalizadoNoBanco = async (id: number): Promise<boolean> =>
  (await pool.query(`SELECT permissoes_personalizadas p FROM usuarios WHERE id = $1`, [id])).rows[0].p;

const tecnico = (permissoes?: string[], ativo = true) => criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes, ativo });
const operador = (permissoes?: string[]) => criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes });

const emGrupo = (quem: ReturnType<typeof com>, corpo: object) => quem.post("/permissoes/em-grupo", corpo);
const idsDe = (lista: { id: number }[]) => lista.map((x) => x.id).sort((a, b) => a - b);

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("validação do pedido", () => {
  it.each([
    ["sem corpo", {}],
    ["ação inválida", { acao: "trocar", permissoes: ["os.ver"], alvo: { tipo: "TECNICO" } }],
    ["sem permissões", { acao: "dar", permissoes: [], alvo: { tipo: "TECNICO" } }],
    ["permissão que não existe", { acao: "dar", permissoes: ["os.voar"], alvo: { tipo: "TECNICO" } }],
    ["tipo ADMIN não existe como alvo", { acao: "dar", permissoes: ["os.ver"], alvo: { tipo: "ADMIN" } }],
    ["sem alvo", { acao: "dar", permissoes: ["os.ver"] }],
    ["lista de usuários vazia", { acao: "dar", permissoes: ["os.ver"], alvo: { usuarios: [] } }],
    ["ids inválidos", { acao: "dar", permissoes: ["os.ver"], alvo: { usuarios: ["abc"] } }],
  ])("%s devolve 400", async (_nome, corpo) => {
    expect((await emGrupo(gestor(), corpo)).status).toBe(400);
  });

  it("sem login devolve 401", async () => {
    expect((await request(app).post("/permissoes/em-grupo").send({})).status).toBe(401);
  });
});

describe("por tipo", () => {
  it("DAR: todos os técnicos ganham; operadores e outras empresas não mudam", async () => {
    const t1 = await tecnico(["maquinas.ver"]);
    const t2 = await tecnico(["maquinas.ver"]);
    const op = await operador(["maquinas.ver"]);
    const tecB = await criarUsuarioTeste(fx.B, { role: "TECNICO", permissoes: ["maquinas.ver"] });

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.ver"], alvo: { tipo: "TECNICO" } });

    expect(res.status).toBe(200);
    expect(res.body.simulado).toBe(false);
    expect(idsDe(res.body.alterados)).toEqual(expect.arrayContaining([t1.id, t2.id]));
    expect(res.body.alterados.map((a: any) => a.id)).not.toContain(op.id);

    expect(await permissoesDe(t1.id)).toEqual(["maquinas.ver", "relatorios.ver"]);
    expect(await permissoesDe(t2.id)).toEqual(["maquinas.ver", "relatorios.ver"]);
    expect(await permissoesDe(op.id)).toEqual(["maquinas.ver"]);
    expect(await permissoesDe(tecB.id)).toEqual(["maquinas.ver"]);
  });

  it("DAR completa as dependências (cancelar O.S. traz 'só as minhas'; quem já vê todas não ganha mais nada)", async () => {
    const semVer = await tecnico(["maquinas.ver"]);
    const vendoTudo = await tecnico(["os.ver"]);

    await emGrupo(gestor(), { acao: "dar", permissoes: ["os.cancelar"], alvo: { tipo: "TECNICO" } });

    expect(await permissoesDe(semVer.id)).toEqual(["maquinas.ver", "os.cancelar", "os.ver_proprias"]);
    expect(await permissoesDe(vendoTudo.id)).toEqual(["os.cancelar", "os.ver"]);
  });

  it("RETIRAR leva junto o que dependia (sem 'ver máquinas' caem cadastrar e editar) e preserva o resto", async () => {
    const t = await tecnico(["maquinas.ver", "maquinas.criar", "maquinas.editar", "setores.ver"]);

    const res = await emGrupo(gestor(), { acao: "retirar", permissoes: ["maquinas.ver"], alvo: { tipo: "TECNICO" } });

    expect(res.status).toBe(200);
    expect(await permissoesDe(t.id)).toEqual(["setores.ver"]);
  });

  it("SIMULAR mostra o que aconteceria e não grava nada", async () => {
    const t = await tecnico(["maquinas.ver"]);
    const antes = await permissoesDe(t.id);

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.exportar"], alvo: { tipo: "TECNICO" }, simular: true });

    expect(res.body.simulado).toBe(true);
    expect(idsDe(res.body.alterados)).toContain(t.id);
    expect(await permissoesDe(t.id)).toEqual(antes);
  });

  it("quem já está assim é ignorado como 'sem mudança'", async () => {
    const t = await tecnico(["relatorios.ver"]);
    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.ver"], alvo: { tipo: "TECNICO" } });

    expect(res.body.ignorados).toEqual(expect.arrayContaining([expect.objectContaining({ id: t.id, motivo: "sem_mudanca" })]));
    expect(res.body.alterados.map((a: any) => a.id)).not.toContain(t.id);
  });

  it("funcionário antigo (permissões ainda não gravadas) parte do padrão do tipo", async () => {
    const antigo = await tecnico(); // não inicializado
    await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.ver"], alvo: { tipo: "TECNICO" } });

    expect(await permissoesDe(antigo.id)).toEqual([...new Set([...PADRAO_POR_PAPEL.TECNICO, "relatorios.ver"])].sort());
    expect(await personalizadoNoBanco(antigo.id)).toBe(false);
  });

  it("inclui quem está desativado (ao reativar já tem o combinado)", async () => {
    const inativo = await tecnico(["maquinas.ver"], false);
    await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" } });
    expect(await permissoesDe(inativo.id)).toContain("setores.ver");
  });

  it("funcionário criado DEPOIS não é afetado (vale para quem existia)", async () => {
    await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.exportar"], alvo: { tipo: "TECNICO" } });
    const criado = await gestor().post("/usuarios", { nome: "Novo", email: `${Math.random().toString(36).slice(2)}@vitest.local`, senha: "abc123", role: "TECNICO" });
    expect(await permissoesDe(criado.body.id)).toEqual([...PADRAO_POR_PAPEL.TECNICO].sort());
  });

  it("vale NA HORA: a permissão retirada barra o técnico no próximo clique", async () => {
    const t = await tecnico(["maquinas.ver"]);
    expect((await com(t.token).get("/maquinas")).status).toBe(200);

    await emGrupo(gestor(), { acao: "retirar", permissoes: ["maquinas.ver"], alvo: { tipo: "TECNICO" } });

    expect((await com(t.token).get("/maquinas")).status).toBe(403);
  });
});

describe("por seleção", () => {
  it("só os selecionados mudam", async () => {
    const a = await tecnico(["maquinas.ver"]);
    const b = await operador(["maquinas.ver"]);
    const c = await tecnico(["maquinas.ver"]);

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [a.id, b.id] } });

    expect(res.status).toBe(200);
    expect(idsDe(res.body.alterados)).toEqual([a.id, b.id].sort((x, y) => x - y));
    expect(await permissoesDe(a.id)).toContain("setores.ver");
    expect(await permissoesDe(b.id)).toContain("setores.ver");
    expect(await permissoesDe(c.id)).not.toContain("setores.ver");
  });

  it("ids repetidos contam uma vez", async () => {
    const a = await tecnico(["maquinas.ver"]);
    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [a.id, a.id, a.id] } });
    expect(res.body.total).toBe(1);
  });

  it("selecionar alguém de OUTRA empresa recusa o pedido inteiro (404) e ninguém muda", async () => {
    const a = await tecnico(["maquinas.ver"]);
    const deB = await criarUsuarioTeste(fx.B, { role: "TECNICO", permissoes: ["maquinas.ver"] });

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [a.id, deB.id] } });

    expect(res.status).toBe(404);
    expect(await permissoesDe(a.id)).toEqual(["maquinas.ver"]);
    expect(await permissoesDe(deB.id)).toEqual(["maquinas.ver"]);
  });

  it("id que não existe recusa o pedido inteiro (404)", async () => {
    const a = await tecnico(["maquinas.ver"]);
    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [a.id, 2147483000] } });
    expect(res.status).toBe(404);
    expect(await permissoesDe(a.id)).toEqual(["maquinas.ver"]);
  });
});

describe("prioridade: o ajuste individual vale mais que o grupo", () => {
  it("o painel da linha marca o funcionário como 'ajuste individual'; novo funcionário não vem marcado", async () => {
    const t = await tecnico(["maquinas.ver"]);
    expect(await personalizadoNoBanco(t.id)).toBe(false);

    await gestor().put(`/permissoes/usuarios/${t.id}`, { permissoes: ["maquinas.ver", "setores.ver"] });

    expect(await personalizadoNoBanco(t.id)).toBe(true);
    expect((await gestor().get(`/permissoes/usuarios/${t.id}`)).body.personalizado).toBe(true);

    const novo = await gestor().post("/usuarios", { nome: "N", email: `${Math.random().toString(36).slice(2)}@vitest.local`, senha: "abc123", role: "OPERADOR" });
    expect(await personalizadoNoBanco(novo.body.id)).toBe(false);
  });

  it("por TIPO: quem tem ajuste individual é ignorado e não muda", async () => {
    const livre = await tecnico(["maquinas.ver"]);
    const ajustado = await tecnico(["maquinas.ver"]);
    await gestor().put(`/permissoes/usuarios/${ajustado.id}`, { permissoes: ["maquinas.ver", "monitoramento.ver"] });

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.ver"], alvo: { tipo: "TECNICO" } });

    expect(res.body.ignorados).toEqual(expect.arrayContaining([expect.objectContaining({ id: ajustado.id, motivo: "ajuste_individual" })]));
    expect(await permissoesDe(ajustado.id)).toEqual(["maquinas.ver", "monitoramento.ver"]);
    expect(await permissoesDe(livre.id)).toContain("relatorios.ver");
  });

  it("por SELEÇÃO também: escolher o funcionário não vence o ajuste individual", async () => {
    const ajustado = await operador(["maquinas.ver"]);
    await gestor().put(`/permissoes/usuarios/${ajustado.id}`, { permissoes: ["maquinas.ver"] });

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [ajustado.id] } });

    expect(res.body.alterados).toEqual([]);
    expect(res.body.ignorados[0]).toMatchObject({ id: ajustado.id, motivo: "ajuste_individual" });
    expect(await permissoesDe(ajustado.id)).toEqual(["maquinas.ver"]);
  });

  it("RETIRAR em grupo também respeita o ajuste individual", async () => {
    const ajustado = await tecnico(["maquinas.ver", "setores.ver"]);
    await gestor().put(`/permissoes/usuarios/${ajustado.id}`, { permissoes: ["maquinas.ver", "setores.ver"] });

    await emGrupo(gestor(), { acao: "retirar", permissoes: ["maquinas.ver"], alvo: { tipo: "TECNICO" } });

    expect(await permissoesDe(ajustado.id)).toEqual(["maquinas.ver", "setores.ver"]);
  });

  it("SIMULAR já mostra quem será ignorado (para avisar antes de aplicar)", async () => {
    const ajustado = await tecnico(["maquinas.ver"]);
    await gestor().put(`/permissoes/usuarios/${ajustado.id}`, { permissoes: ["maquinas.ver"] });

    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" }, simular: true });
    expect(res.body.ignorados.map((i: any) => i.id)).toContain(ajustado.id);
  });

  it("'Restaurar padrão do tipo' remove o ajuste individual: volta a seguir o grupo", async () => {
    const t = await tecnico(["maquinas.ver"]);
    await gestor().put(`/permissoes/usuarios/${t.id}`, { permissoes: ["maquinas.ver"] });
    expect(await personalizadoNoBanco(t.id)).toBe(true);

    const restaurado = await gestor().post(`/permissoes/usuarios/${t.id}/restaurar-padrao`);
    expect(restaurado.status).toBe(200);
    expect(await personalizadoNoBanco(t.id)).toBe(false);
    expect(await permissoesDe(t.id)).toEqual([...PADRAO_POR_PAPEL.TECNICO].sort());

    // agora o grupo volta a alcançá-lo
    await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.exportar"], alvo: { usuarios: [t.id] } });
    expect(await permissoesDe(t.id)).toContain("relatorios.exportar");
  });

  it("depois do ajuste individual, o individual continua mandando mesmo com várias rodadas de grupo", async () => {
    const t = await tecnico(["maquinas.ver"]);
    await gestor().put(`/permissoes/usuarios/${t.id}`, { permissoes: ["maquinas.ver"] });

    for (const acao of ["dar", "retirar", "dar"]) {
      await emGrupo(gestor(), { acao, permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" } });
    }

    expect(await permissoesDe(t.id)).toEqual(["maquinas.ver"]);
  });
});

describe("hierarquia e teto", () => {
  it("gestor NÃO altera gestores em grupo (nem por tipo, nem por seleção)", async () => {
    const outroGestor = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });

    const porTipo = await emGrupo(gestor(), { acao: "retirar", permissoes: ["relatorios.exportar"], alvo: { tipo: "GESTOR" } });
    expect(porTipo.status).toBe(403);

    const porSelecao = await emGrupo(gestor(), { acao: "retirar", permissoes: ["relatorios.exportar"], alvo: { usuarios: [outroGestor.id] } });
    expect(porSelecao.status).toBe(403);

    expect(await permissoesDe(outroGestor.id)).toEqual([...TODAS_PERMISSOES].sort());
  });

  it("selecionar a si mesmo ou o administrador recusa o pedido (403) e ninguém muda", async () => {
    const t = await tecnico(["maquinas.ver"]);
    expect((await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id, fx.A.gestorId] } })).status).toBe(403);
    expect((await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id, fx.A.adminId] } })).status).toBe(403);
    expect(await permissoesDe(t.id)).toEqual(["maquinas.ver"]);
  });

  it("o administrador (dono) altera gestores por tipo", async () => {
    const g = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: [...TODAS_PERMISSOES] });
    const res = await emGrupo(admin(), { acao: "retirar", permissoes: ["relatorios.exportar"], alvo: { tipo: "GESTOR" } });

    expect(res.status).toBe(200);
    expect(idsDe(res.body.alterados)).toContain(g.id);
    expect(await permissoesDe(g.id)).not.toContain("relatorios.exportar");
  });

  it("teto: gestor sem uma permissão não consegue dá-la nem retirá-la em grupo (403)", async () => {
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("relatorios.exportar") });
    const t = await tecnico(["relatorios.ver", "relatorios.exportar"]);

    const dar = await emGrupo(com(limitado.token), { acao: "dar", permissoes: ["relatorios.exportar"], alvo: { usuarios: [t.id] } });
    const retirar = await emGrupo(com(limitado.token), { acao: "retirar", permissoes: ["relatorios.exportar"], alvo: { usuarios: [t.id] } });

    expect(dar.status).toBe(403);
    expect(retirar.status).toBe(403);
    expect(await permissoesDe(t.id)).toEqual(["relatorios.exportar", "relatorios.ver"]);
  });

  it("teto por funcionário: se retirar algo arrasta uma permissão que o gestor não possui, aquele funcionário é ignorado", async () => {
    // o gestor possui 'agir em O.S. de outros', mas não 'definir externo' (que depende dele)
    const limitado = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("os.definir_externo") });
    const alvo = await tecnico(["os.ver", "os.agir_em_qualquer", "os.definir_externo"]);

    const res = await emGrupo(com(limitado.token), { acao: "retirar", permissoes: ["os.agir_em_qualquer"], alvo: { usuarios: [alvo.id] } });

    expect(res.status).toBe(200);
    expect(res.body.ignorados[0]).toMatchObject({ id: alvo.id, motivo: "fora_do_seu_limite" });
    expect(await permissoesDe(alvo.id)).toEqual(["os.agir_em_qualquer", "os.definir_externo", "os.ver"]);
  });

  it("quem não tem 'gerenciar permissões' recebe 403", async () => {
    const semGerenciar = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: semPerm("usuarios.gerenciar_permissoes") });
    const res = await emGrupo(com(semGerenciar.token), { acao: "dar", permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" } });
    expect(res.status).toBe(403);
  });

  it("técnico ou operador comuns não conseguem usar (403)", async () => {
    const t = await tecnico();
    const res = await emGrupo(com(t.token), { acao: "dar", permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" } });
    expect(res.status).toBe(403);
  });
});

describe("registro interno, concorrência e isolamento", () => {
  it("cada funcionário alterado gera um registro (grupo_dar / grupo_retirar) com antes e depois", async () => {
    const t = await tecnico(["maquinas.ver"]);
    await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id] } });
    await emGrupo(gestor(), { acao: "retirar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id] } });

    const { rows } = await pool.query(`SELECT acao, antes, depois FROM auditoria_permissoes WHERE usuario_alvo = $1 ORDER BY id`, [t.id]);
    expect(rows.map((r) => r.acao)).toEqual(["grupo_dar", "grupo_retirar"]);
    expect(rows[0]).toMatchObject({ antes: ["maquinas.ver"], depois: ["maquinas.ver", "setores.ver"] });
  });

  it("dar e retirar ao mesmo tempo no mesmo grupo não travam nem misturam (o resultado é um dos dois)", async () => {
    const t = await tecnico(["maquinas.ver"]);
    const [a, b] = await Promise.all([
      emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id] } }),
      emGrupo(gestor(), { acao: "retirar", permissoes: ["setores.ver"], alvo: { usuarios: [t.id] } }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect([JSON.stringify(["maquinas.ver"]), JSON.stringify(["maquinas.ver", "setores.ver"])]).toContain(JSON.stringify(await permissoesDe(t.id)));
  });

  it("uma alteração em grupo da empresa A nunca toca a empresa B", async () => {
    const tecB = await criarUsuarioTeste(fx.B, { role: "TECNICO", permissoes: ["maquinas.ver"] });
    await emGrupo(gestor(), { acao: "dar", permissoes: ["relatorios.ver"], alvo: { tipo: "TECNICO" } });
    await emGrupo(admin(), { acao: "retirar", permissoes: ["maquinas.ver"], alvo: { tipo: "TECNICO" } });
    expect(await permissoesDe(tecB.id)).toEqual(["maquinas.ver"]);
  });

  it("e o administrador da B só alcança a B", async () => {
    const tecA = await tecnico(["maquinas.ver"]);
    const res = await emGrupo(com(fx.B.tokenAdmin), { acao: "dar", permissoes: ["setores.ver"], alvo: { tipo: "TECNICO" } });
    expect(res.status).toBe(200);
    expect(res.body.alterados.map((a: any) => a.id)).not.toContain(tecA.id);
    expect(await permissoesDe(tecA.id)).toEqual(["maquinas.ver"]);
  });
});

describe("desempenho", () => {
  it("aplica em 80 funcionários de uma vez, rápido (gravação em lote, não um por um)", async () => {
    const criados = await pool.query(
      `INSERT INTO usuarios (nome, email, senha, role, empresa_id, ativo, permissoes_inicializadas)
       SELECT $1 || '_lote_' || g, lower($1) || '_lote_' || g || '@vitest.local', 'x', 'OPERADOR', $2, true, true
       FROM generate_series(1, 80) g RETURNING id`,
      [fx.A.marcador, fx.A.empresaId]
    );
    const ids: number[] = criados.rows.map((r) => r.id);
    await pool.query(
      `INSERT INTO usuario_permissoes (usuario_id, permissao, empresa_id)
       SELECT u, 'maquinas.ver', $2 FROM unnest($1::int[]) AS u`,
      [ids, fx.A.empresaId]
    );

    const inicio = Date.now();
    const res = await emGrupo(gestor(), { acao: "dar", permissoes: ["setores.ver"], alvo: { usuarios: ids } });
    const ms = Date.now() - inicio;

    expect(res.status).toBe(200);
    expect(res.body.alterados.length).toBe(80);
    expect(ms).toBeLessThan(8000);

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int n FROM usuario_permissoes WHERE usuario_id = ANY($1::int[]) AND permissao = 'setores.ver'`,
      [ids]
    );
    expect(rows[0].n).toBe(80);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Storage falso: nada vai pro Supabase de verdade.
vi.mock("../src/config/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `http://storage.fake/${p}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  },
}));

import { app } from "../src/app";
import { LEITURA_DE_APOIO, TODAS_PERMISSOES } from "../src/permissoes/catalogo";
import { criarFixture, criarUsuarioTeste, fecharPool, limparTudo, pool, Fixture, UsuarioTeste } from "./helpers/fixture";

/**
 * MATRIZ: para CADA permissão do catálogo,
 *  (a) quem tem SÓ aquela permissão consegue chamar a funcionalidade;
 *  (b) quem tem TODAS as outras (menos ela) recebe 403.
 * Depois: leituras de apoio entre telas, escopo "só as minhas O.S." e dono da O.S.
 */

let fx: Fixture;
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

/* ---------------- recursos descartáveis (empresa A) ---------------- */

const unico = () => Math.random().toString(36).slice(2, 9);

async function novaMaquina(): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO maquinas (nome, modelo, setor_id, status, empresa_id) VALUES ($1,'M',$2,'ativa',$3) RETURNING id`,
    [`${fx.A.marcador}_maq_${unico()}`, fx.A.setorId, fx.A.empresaId]
  );
  return rows[0].id;
}
async function novoSetor(): Promise<number> {
  const { rows } = await pool.query(`INSERT INTO setores (nome, empresa_id) VALUES ($1,$2) RETURNING id`, [
    `${fx.A.marcador}_set_${unico()}`,
    fx.A.empresaId,
  ]);
  return rows[0].id;
}
async function novoParceiro(): Promise<number> {
  const { rows } = await pool.query(`INSERT INTO parceiros (nome, empresa_id) VALUES ($1,$2) RETURNING id`, [
    `${fx.A.marcador}_par_${unico()}`,
    fx.A.empresaId,
  ]);
  return rows[0].id;
}
async function novaOS(o: { status?: string; id_tecnico?: number | null; id_solicitante?: number | null; externa?: boolean } = {}): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_solicitante, id_tecnico, execucao_externa, empresa_id)
     VALUES ($1,$2,$3,'CORRETIVA','ALTA', NOW(), $4, $5, $6, $7) RETURNING id`,
    [
      fx.A.maquinaId,
      `${fx.A.marcador}_os_${unico()}`,
      o.status ?? "ABERTA",
      o.id_solicitante === undefined ? fx.A.adminId : o.id_solicitante,
      o.id_tecnico ?? null,
      o.externa ?? false,
      fx.A.empresaId,
    ]
  );
  return rows[0].id;
}
async function novoAlvo(role = "OPERADOR"): Promise<number> {
  return (await criarUsuarioTeste(fx.A, { role, permissoes: [] })).id;
}
async function novoAnexo(): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO anexos (maquina_id, nome_arquivo, caminho_arquivo, url_arquivo, tipo_arquivo, origem, empresa_id)
     VALUES ($1,'a.png','maquina/x/a.png','http://storage.fake/a.png','image/png','MAQUINA',$2) RETURNING id`,
    [fx.A.maquinaId, fx.A.empresaId]
  );
  return rows[0].id;
}

/* ---------------- executor ---------------- */

interface Rota {
  metodo: "get" | "post" | "put" | "patch" | "delete";
  url: string;
  corpo?: object;
  campos?: Record<string, string>;
  arquivo?: boolean;
}

function chamar(token: string, r: Rota) {
  let req = request(app)[r.metodo](r.url).set("Authorization", `Bearer ${token}`);
  if (r.campos) for (const [k, v] of Object.entries(r.campos)) req = req.field(k, v);
  if (r.arquivo) req = req.attach("arquivo", PNG, { filename: "foto.png", contentType: "image/png" });
  else if (r.corpo) req = req.send(r.corpo);
  return req;
}

interface Caso {
  nome: string;
  permissao: string;
  /** permissões que também liberam esta rota (removidas no caso "sem a permissão") */
  alternativas?: string[];
  preparar: (u: UsuarioTeste) => Promise<Rota>;
}

const parametro = [{ chave: "temperatura", unidade: "C", minimo: null, atencao: 70, alarme: 90, janela_seg: 60, abrir_os_auto: false, ativo: true }];

const casos: Caso[] = [
  { nome: "GET /dashboard/gestor/kpis", permissao: "dashboard.ver_gestor", preparar: async () => ({ metodo: "get", url: "/dashboard/gestor/kpis" }) },

  { nome: "GET /maquinas/:id/os", permissao: "maquinas.ver", preparar: async () => ({ metodo: "get", url: `/maquinas/${fx.A.maquinaId}/os` }) },
  { nome: "GET indicadores da máquina", permissao: "maquinas.ver", preparar: async () => ({ metodo: "get", url: `/ordens-servico/maquina/${fx.A.maquinaId}/indicadores` }) },
  {
    nome: "POST /maquinas",
    permissao: "maquinas.criar",
    preparar: async () => ({ metodo: "post", url: "/maquinas", campos: { nome: `${fx.A.marcador}_m_${unico()}`, modelo: "M", setor_id: String(fx.A.setorId) } }),
  },
  {
    nome: "PUT /maquinas/:id",
    permissao: "maquinas.editar",
    preparar: async () => ({ metodo: "put", url: `/maquinas/${await novaMaquina()}`, campos: { nome: `${fx.A.marcador}_edit`, modelo: "M", setor_id: String(fx.A.setorId) } }),
  },
  { nome: "DELETE /maquinas/:id", permissao: "maquinas.excluir", preparar: async () => ({ metodo: "delete", url: `/maquinas/${await novaMaquina()}` }) },
  { nome: "PATCH /maquinas/:id/status", permissao: "maquinas.alterar_status", preparar: async () => ({ metodo: "patch", url: `/maquinas/${await novaMaquina()}/status` }) },

  { nome: "GET /ordens-servico (todas)", permissao: "os.ver", alternativas: ["os.ver", "os.ver_proprias"], preparar: async () => ({ metodo: "get", url: "/ordens-servico" }) },
  { nome: "GET /ordens-servico (só as minhas)", permissao: "os.ver_proprias", alternativas: ["os.ver", "os.ver_proprias"], preparar: async () => ({ metodo: "get", url: "/ordens-servico" }) },
  {
    nome: "POST /ordens-servico",
    permissao: "os.criar",
    preparar: async () => ({ metodo: "post", url: "/ordens-servico", corpo: { maquina_id: fx.A.maquinaId, descricao: `${fx.A.marcador}_nova`, tipo_manutencao: "CORRETIVA", prioridade: "MEDIA" } }),
  },
  { nome: "PUT /ordens-servico/:id", permissao: "os.editar", preparar: async () => ({ metodo: "put", url: `/ordens-servico/${await novaOS()}`, corpo: { maquina_id: fx.A.maquinaId, descricao: "editada" } }) },
  { nome: "DELETE /ordens-servico/:id", permissao: "os.excluir", preparar: async () => ({ metodo: "delete", url: `/ordens-servico/${await novaOS()}` }) },
  {
    nome: "atribuir a outro técnico",
    permissao: "os.atribuir",
    preparar: async () => ({ metodo: "patch", url: `/ordens-servico/${await novaOS()}/atribuir`, corpo: { id_tecnico: fx.A.tecnico2Id } }),
  },
  {
    nome: "assumir pra si mesmo",
    permissao: "os.assumir",
    preparar: async (u) => ({ metodo: "patch", url: `/ordens-servico/${await novaOS()}/atribuir`, corpo: { id_tecnico: u.id } }),
  },
  {
    nome: "definir técnico externo",
    permissao: "os.definir_externo",
    preparar: async () => ({ metodo: "patch", url: `/ordens-servico/${await novaOS()}/atribuir`, corpo: { externo: true } }),
  },
  {
    nome: "iniciar (na O.S. dele)",
    permissao: "os.iniciar",
    preparar: async (u) => ({ metodo: "patch", url: `/ordens-servico/${await novaOS({ status: "ATRIBUIDA", id_tecnico: u.id })}/iniciar` }),
  },
  {
    nome: "pausar (na O.S. dele)",
    permissao: "os.pausar",
    preparar: async (u) => ({ metodo: "patch", url: `/ordens-servico/${await novaOS({ status: "EM_ANDAMENTO", id_tecnico: u.id })}/pausar`, corpo: {} }),
  },
  {
    nome: "finalizar (na O.S. dele)",
    permissao: "os.finalizar",
    preparar: async (u) => ({ metodo: "patch", url: `/ordens-servico/${await novaOS({ status: "EM_ANDAMENTO", id_tecnico: u.id })}/finalizar`, corpo: { resolucao: "ok" } }),
  },
  { nome: "cancelar", permissao: "os.cancelar", preparar: async () => ({ metodo: "patch", url: `/ordens-servico/${await novaOS()}/cancelar`, corpo: { motivo_cancelamento: "x" } }) },
  { nome: "alterar prioridade", permissao: "os.alterar_prioridade", preparar: async () => ({ metodo: "patch", url: `/ordens-servico/${await novaOS()}/prioridade`, corpo: { prioridade: "BAIXA" } }) },

  { nome: "GET /monitoramento/alertas", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: "/monitoramento/alertas" }) },
  { nome: "GET /monitoramento/pendentes", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: "/monitoramento/pendentes" }) },
  { nome: "GET /monitoramento/.../parametros", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: `/monitoramento/maquinas/${fx.A.maquinaId}/parametros` }) },
  { nome: "GET /telemetria", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: "/telemetria" }) },
  { nome: "GET /telemetria/status", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: "/telemetria/status" }) },
  { nome: "GET /telemetria/:id/historico", permissao: "monitoramento.ver", preparar: async () => ({ metodo: "get", url: `/telemetria/${fx.A.maquinaId}/historico` }) },
  { nome: "PUT parâmetros de limite", permissao: "monitoramento.configurar_limites", preparar: async () => ({ metodo: "put", url: `/monitoramento/maquinas/${fx.A.maquinaId}/parametros`, corpo: parametro }) },
  { nome: "DELETE parâmetro de limite", permissao: "monitoramento.configurar_limites", preparar: async () => ({ metodo: "delete", url: `/monitoramento/maquinas/${fx.A.maquinaId}/parametros/temperatura` }) },
  { nome: "resolver alerta", permissao: "monitoramento.resolver_alertas", preparar: async () => ({ metodo: "patch", url: "/monitoramento/alertas/2147483000/resolver" }) },
  { nome: "abrir O.S. pelo alerta", permissao: "monitoramento.abrir_os", preparar: async () => ({ metodo: "post", url: "/monitoramento/alertas/2147483000/abrir-os", corpo: {} }) },

  { nome: "POST /setores", permissao: "setores.criar", preparar: async () => ({ metodo: "post", url: "/setores", corpo: { nome: `${fx.A.marcador}_s_${unico()}` } }) },
  { nome: "PUT /setores/:id", permissao: "setores.editar", preparar: async () => ({ metodo: "put", url: `/setores/${await novoSetor()}`, corpo: { nome: `${fx.A.marcador}_s_${unico()}` } }) },
  { nome: "DELETE /setores/:id", permissao: "setores.excluir", preparar: async () => ({ metodo: "delete", url: `/setores/${await novoSetor()}` }) },

  { nome: "POST /parceiros", permissao: "parceiros.criar", preparar: async () => ({ metodo: "post", url: "/parceiros", corpo: { nome: `${fx.A.marcador}_p_${unico()}` } }) },
  { nome: "PUT /parceiros/:id", permissao: "parceiros.editar", preparar: async () => ({ metodo: "put", url: `/parceiros/${await novoParceiro()}`, corpo: { nome: `${fx.A.marcador}_p_${unico()}` } }) },
  { nome: "DELETE /parceiros/:id", permissao: "parceiros.excluir", preparar: async () => ({ metodo: "delete", url: `/parceiros/${await novoParceiro()}` }) },

  { nome: "GET /usuarios", permissao: "usuarios.ver", preparar: async () => ({ metodo: "get", url: "/usuarios" }) },
  { nome: "GET /usuarios/:id", permissao: "usuarios.ver", preparar: async () => ({ metodo: "get", url: `/usuarios/${await novoAlvo()}` }) },
  {
    nome: "POST /usuarios",
    permissao: "usuarios.criar",
    preparar: async () => ({ metodo: "post", url: "/usuarios", corpo: { nome: "Novo", email: `${unico()}@vitest.local`, senha: "abc123", role: "OPERADOR" } }),
  },
  {
    nome: "PUT /usuarios/:id",
    permissao: "usuarios.editar",
    preparar: async () => ({ metodo: "put", url: `/usuarios/${await novoAlvo("TECNICO")}`, corpo: { nome: "Editado", email: `${unico()}@vitest.local`, role: "TECNICO" } }),
  },
  { nome: "DELETE /usuarios/:id", permissao: "usuarios.excluir", preparar: async () => ({ metodo: "delete", url: `/usuarios/${await novoAlvo()}` }) },
  { nome: "PATCH /usuarios/:id/toggle-status", permissao: "usuarios.alterar_status", preparar: async () => ({ metodo: "patch", url: `/usuarios/${await novoAlvo()}/toggle-status` }) },

  { nome: "GET preview de relatório", permissao: "relatorios.ver", preparar: async () => ({ metodo: "get", url: "/relatorios/ordens-servico/preview" }) },
  { nome: "GET exportar relatório", permissao: "relatorios.exportar", preparar: async () => ({ metodo: "get", url: "/relatorios/ordens-servico" }) },

  { nome: "GET /anexos/maquina/:id", permissao: "anexos.ver", preparar: async () => ({ metodo: "get", url: `/anexos/maquina/${fx.A.maquinaId}` }) },
  { nome: "GET /anexos/os/:id", permissao: "anexos.ver", preparar: async () => ({ metodo: "get", url: `/anexos/os/${fx.A.osId}` }) },
  { nome: "POST /anexos/upload", permissao: "anexos.enviar", preparar: async () => ({ metodo: "post", url: "/anexos/upload", campos: { origem: "MAQUINA", maquina_id: String(fx.A.maquinaId) }, arquivo: true }) },
  { nome: "DELETE /anexos/:id", permissao: "anexos.excluir", preparar: async () => ({ metodo: "delete", url: `/anexos/${await novoAnexo()}` }) },
];

describe("matriz: cada permissão libera a sua funcionalidade e só ela", () => {
  it("todas as permissões do catálogo (menos a de gerenciar permissões, testada à parte) têm caso na matriz", () => {
    const cobertas = new Set(casos.map((c) => c.permissao));
    const semCaso = TODAS_PERMISSOES.filter(
      (p) => !cobertas.has(p) && !["usuarios.gerenciar_permissoes", "os.agir_em_qualquer"].includes(p)
    );
    // setores.ver / parceiros.ver são leituras de apoio: cobertas no bloco "leituras de apoio"
    expect(semCaso.sort()).toEqual(["parceiros.ver", "setores.ver"]);
  });

  it.each(casos.map((c) => [`${c.permissao} → ${c.nome}`, c] as const))("%s", async (_nome, c) => {
    // (a) só com a permissão: passa (não é 401/403 — o resto é validação/regra de negócio)
    const so = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: [c.permissao] });
    const liberado = await chamar(so.token, await c.preparar(so));
    expect(liberado.status, `com só ${c.permissao}: ${JSON.stringify(liberado.body)}`).not.toBe(403);
    expect(liberado.status).not.toBe(401);
    expect(liberado.status).toBeLessThan(500);

    // (b) com todas as outras: barrado, e a resposta diz qual permissão faltou
    const retiradas = new Set([c.permissao, ...(c.alternativas ?? [])]);
    const menos = await criarUsuarioTeste(fx.A, {
      role: "TECNICO",
      permissoes: TODAS_PERMISSOES.filter((p) => !retiradas.has(p)),
    });
    const barrado = await chamar(menos.token, await c.preparar(menos));
    expect(barrado.status, `sem ${c.permissao}`).toBe(403);
    expect(barrado.body.permissao_necessaria).toBeDefined();
  });
});

describe("usuário sem nenhuma permissão", () => {
  it("só usa o que não depende de permissão (notificações, /permissoes/eu, catálogo); o resto é 403", async () => {
    const nada = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: [] });

    for (const [metodo, url] of [
      ["get", "/notificacoes"],
      ["get", "/notificacoes/contador"],
      ["get", "/permissoes/eu"],
      ["get", "/permissoes/catalogo"],
    ] as const) {
      expect((await chamar(nada.token, { metodo, url })).status, url).toBe(200);
    }

    for (const url of ["/maquinas", "/setores", "/parceiros", "/usuarios", "/usuarios/tecnicos", "/ordens-servico", "/telemetria", "/monitoramento/alertas", "/dashboard/gestor/kpis", "/relatorios/ordens-servico/preview"]) {
      expect((await chamar(nada.token, { metodo: "get", url })).status, url).toBe(403);
    }
  });
});

describe("leituras de apoio entre telas", () => {
  const rotas: Record<keyof typeof LEITURA_DE_APOIO, string> = {
    maquinas: "/maquinas",
    setores: "/setores",
    parceiros: "/parceiros",
    tecnicos: "/usuarios/tecnicos",
  };

  for (const [nome, lista] of Object.entries(LEITURA_DE_APOIO)) {
    const url = rotas[nome as keyof typeof LEITURA_DE_APOIO];

    it.each([...lista])(`${url}: liberada por ${"%s"}`, async (permissao) => {
      const u = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: [permissao] });
      expect((await chamar(u.token, { metodo: "get", url })).status).toBe(200);
    });

    it(`${url}: barrada sem nenhuma delas`, async () => {
      const u = await criarUsuarioTeste(fx.A, {
        role: "OPERADOR",
        permissoes: TODAS_PERMISSOES.filter((p) => !(lista as readonly string[]).includes(p)),
      });
      expect((await chamar(u.token, { metodo: "get", url })).status).toBe(403);
    });
  }

  it("uma permissão sem relação (anexos.ver) não abre a lista de setores", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["anexos.ver"] });
    expect((await chamar(u.token, { metodo: "get", url: "/setores" })).status).toBe(403);
  });
});

describe("escopo das O.S.: ver todas × só as minhas", () => {
  let proprias: UsuarioTeste;
  let osDele: number;
  let osAtribuida: number;
  let osOutro: number;

  beforeAll(async () => {
    proprias = await criarUsuarioTeste(fx.A, {
      role: "OPERADOR",
      permissoes: ["os.ver_proprias", "os.criar", "os.cancelar", "maquinas.ver", "anexos.ver"],
    });
    osDele = await novaOS({ id_solicitante: proprias.id });
    osAtribuida = await novaOS({ id_tecnico: proprias.id, id_solicitante: fx.A.adminId });
    osOutro = await novaOS({ id_solicitante: fx.A.adminId, id_tecnico: fx.A.tecnicoId });
    await pool.query(
      `INSERT INTO anexos (ordem_servico_id, nome_arquivo, caminho_arquivo, url_arquivo, origem, empresa_id)
       VALUES ($1,'o.png','os/x.png','http://storage.fake/o.png','OS_ABERTURA',$2)`,
      [osOutro, fx.A.empresaId]
    );
  });

  it("a lista traz só as que ele abriu ou que são dele, e o total confere", async () => {
    const res = await chamar(proprias.token, { metodo: "get", url: "/ordens-servico" });
    expect(res.status).toBe(200);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).toEqual(expect.arrayContaining([osDele, osAtribuida]));
    expect(ids).not.toContain(osOutro);
    expect(ids.length).toBe(2);
    expect(Number(res.headers["x-total-count"])).toBe(2);
  });

  it("O.S. de outro não abre nem pelo id direto (404), a dele abre", async () => {
    expect((await chamar(proprias.token, { metodo: "get", url: `/ordens-servico/${osOutro}` })).status).toBe(404);
    expect((await chamar(proprias.token, { metodo: "get", url: `/ordens-servico/${osDele}` })).status).toBe(200);
  });

  it("nem agir na O.S. de outro: cancelar devolve 404 e ela não muda", async () => {
    const res = await chamar(proprias.token, { metodo: "patch", url: `/ordens-servico/${osOutro}/cancelar`, corpo: { motivo_cancelamento: "x" } });
    expect(res.status).toBe(404);
    const { rows } = await pool.query(`SELECT status FROM ordens_servico WHERE id = $1`, [osOutro]);
    expect(rows[0].status).toBe("ABERTA");
  });

  it("na tela da máquina só aparecem as O.S. dele", async () => {
    const res = await chamar(proprias.token, { metodo: "get", url: `/maquinas/${fx.A.maquinaId}/os` });
    const ids = res.body.map((o: any) => o.id);
    expect(ids).toEqual(expect.arrayContaining([osDele, osAtribuida]));
    expect(ids).not.toContain(osOutro);
  });

  it("anexos da O.S. de outro vêm vazios", async () => {
    const res = await chamar(proprias.token, { metodo: "get", url: `/anexos/os/${osOutro}` });
    expect(res.body).toEqual([]);
  });

  it("indicadores (somam a empresa toda) vêm zerados; com 'ver todas' vêm de verdade", async () => {
    const zerado = await chamar(proprias.token, { metodo: "get", url: `/ordens-servico/maquina/${fx.A.maquinaId}/indicadores` });
    expect(zerado.status).toBe(200);
    expect(zerado.body.osAbertas).toBe(0);

    const todas = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["os.ver", "maquinas.ver"] });
    const real = await chamar(todas.token, { metodo: "get", url: `/ordens-servico/maquina/${fx.A.maquinaId}/indicadores` });
    expect(real.body.osAbertas).toBeGreaterThan(0);
  });

  it("uma O.S. que ele abre agora entra na lista dele", async () => {
    const criada = await chamar(proprias.token, {
      metodo: "post",
      url: "/ordens-servico",
      corpo: { maquina_id: fx.A.maquinaId, descricao: `${fx.A.marcador}_dele_nova`, tipo_manutencao: "CORRETIVA", prioridade: "MEDIA" },
    });
    expect(criada.status).toBe(201);
    const lista = await chamar(proprias.token, { metodo: "get", url: "/ordens-servico" });
    expect(lista.body.map((o: any) => o.id)).toContain(criada.body.id);
  });

  it("com 'ver todas' enxerga tudo", async () => {
    const todas = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["os.ver"] });
    const res = await chamar(todas.token, { metodo: "get", url: "/ordens-servico" });
    expect(res.body.map((o: any) => o.id)).toContain(osOutro);
  });

  it("sem nenhuma das duas permissões de ver O.S., a lista é 403 e a da máquina vem vazia", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["maquinas.ver"] });
    expect((await chamar(u.token, { metodo: "get", url: "/ordens-servico" })).status).toBe(403);
    const daMaquina = await chamar(u.token, { metodo: "get", url: `/maquinas/${fx.A.maquinaId}/os` });
    expect(daMaquina.status).toBe(200);
    expect(daMaquina.body).toEqual([]);
  });
});

describe("dono da O.S.: iniciar / pausar / finalizar", () => {
  it("o técnico responsável age na O.S. dele; na de outro técnico não", async () => {
    const tec = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.iniciar"] });
    const dele = await novaOS({ status: "ATRIBUIDA", id_tecnico: tec.id });
    const doOutro = await novaOS({ status: "ATRIBUIDA", id_tecnico: fx.A.tecnicoId });

    expect((await chamar(tec.token, { metodo: "patch", url: `/ordens-servico/${dele}/iniciar` })).status).toBe(200);
    const negado = await chamar(tec.token, { metodo: "patch", url: `/ordens-servico/${doOutro}/iniciar` });
    expect(negado.status).toBe(403);
    expect(negado.body.permissao_necessaria).toEqual(["os.agir_em_qualquer"]);
    const { rows } = await pool.query(`SELECT status FROM ordens_servico WHERE id = $1`, [doOutro]);
    expect(rows[0].status).toBe("ATRIBUIDA");
  });

  it("com 'agir em O.S. de outros' age nas de qualquer técnico e nas externas", async () => {
    const chefe = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: ["os.ver", "os.iniciar", "os.agir_em_qualquer"] });
    const doOutro = await novaOS({ status: "ATRIBUIDA", id_tecnico: fx.A.tecnicoId });
    const externa = await novaOS({ status: "ATRIBUIDA", externa: true });

    expect((await chamar(chefe.token, { metodo: "patch", url: `/ordens-servico/${doOutro}/iniciar` })).status).toBe(200);
    expect((await chamar(chefe.token, { metodo: "patch", url: `/ordens-servico/${externa}/iniciar` })).status).toBe(200);
  });

  it("O.S. externa não é do técnico, mesmo que o id_tecnico coincida", async () => {
    const tec = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.iniciar"] });
    const externa = await novaOS({ status: "ATRIBUIDA", id_tecnico: tec.id, externa: true });
    expect((await chamar(tec.token, { metodo: "patch", url: `/ordens-servico/${externa}/iniciar` })).status).toBe(403);
  });

  it("O.S. que não existe devolve o erro normal (não 403)", async () => {
    const tec = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.iniciar"] });
    const res = await chamar(tec.token, { metodo: "patch", url: "/ordens-servico/2147483000/iniciar" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/não encontrada/i);
  });
});

describe("atribuir: cada situação pede a sua permissão", () => {
  it("assumir pra si exige 'assumir'; atribuir a outro exige 'atribuir'; externo exige 'definir externo'", async () => {
    const soAssume = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: ["os.ver", "os.assumir"] });
    const os1 = await novaOS();
    expect((await chamar(soAssume.token, { metodo: "patch", url: `/ordens-servico/${os1}/atribuir`, corpo: { id_tecnico: fx.A.tecnicoId } })).status).toBe(403);
    expect((await chamar(soAssume.token, { metodo: "patch", url: `/ordens-servico/${os1}/atribuir`, corpo: { externo: true } })).status).toBe(403);
    expect((await chamar(soAssume.token, { metodo: "patch", url: `/ordens-servico/${os1}/atribuir`, corpo: { id_tecnico: soAssume.id } })).status).toBe(200);

    const soAtribui = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: ["os.ver", "os.atribuir"] });
    const os2 = await novaOS();
    expect((await chamar(soAtribui.token, { metodo: "patch", url: `/ordens-servico/${os2}/atribuir`, corpo: { id_tecnico: soAtribui.id } })).status).toBe(403);
    expect((await chamar(soAtribui.token, { metodo: "patch", url: `/ordens-servico/${os2}/atribuir`, corpo: { externo: true } })).status).toBe(403);
    expect((await chamar(soAtribui.token, { metodo: "patch", url: `/ordens-servico/${os2}/atribuir`, corpo: { id_tecnico: fx.A.tecnicoId } })).status).toBe(200);
  });

  it("ao abrir a O.S., escolher o técnico só vale com 'atribuir'; senão a O.S. nasce sem técnico", async () => {
    const corpo = { maquina_id: fx.A.maquinaId, descricao: `${fx.A.marcador}_com_tecnico`, tipo_manutencao: "CORRETIVA", prioridade: "MEDIA", id_tecnico: fx.A.tecnicoId };

    const sem = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["os.ver", "os.criar"] });
    const a = await chamar(sem.token, { metodo: "post", url: "/ordens-servico", corpo });
    expect(a.status).toBe(201);
    expect((await pool.query(`SELECT id_tecnico FROM ordens_servico WHERE id = $1`, [a.body.id])).rows[0].id_tecnico).toBeNull();

    const com = await criarUsuarioTeste(fx.A, { role: "GESTOR", permissoes: ["os.ver", "os.criar", "os.atribuir"] });
    const b = await chamar(com.token, { metodo: "post", url: "/ordens-servico", corpo });
    expect(b.status).toBe(201);
    expect((await pool.query(`SELECT id_tecnico FROM ordens_servico WHERE id = $1`, [b.body.id])).rows[0].id_tecnico).toBe(fx.A.tecnicoId);
  });

  it("o solicitante é sempre quem abriu (mesmo forjando outro no corpo)", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "OPERADOR", permissoes: ["os.ver", "os.criar"] });
    const res = await chamar(u.token, {
      metodo: "post",
      url: "/ordens-servico",
      corpo: { maquina_id: fx.A.maquinaId, descricao: `${fx.A.marcador}_forjada`, tipo_manutencao: "CORRETIVA", prioridade: "BAIXA", id_solicitante: fx.A.adminId },
    });
    expect((await pool.query(`SELECT id_solicitante FROM ordens_servico WHERE id = $1`, [res.body.id])).rows[0].id_solicitante).toBe(u.id);
  });
});

describe("padrão automático para funcionários existentes (migração preguiçosa)", () => {
  it("usuário sem permissões inicializadas recebe o padrão do tipo na 1ª requisição, uma única vez", async () => {
    const antigo = await criarUsuarioTeste(fx.A, { role: "TECNICO" }); // sem permissoes => "não inicializado"

    const antes = await pool.query(`SELECT permissoes_inicializadas FROM usuarios WHERE id = $1`, [antigo.id]);
    expect(antes.rows[0].permissoes_inicializadas).toBe(false);

    const eu = await chamar(antigo.token, { metodo: "get", url: "/permissoes/eu" });
    expect(eu.status).toBe(200);
    expect(eu.body.permissoes).toEqual(expect.arrayContaining(["os.ver", "os.assumir", "os.iniciar", "os.finalizar", "maquinas.ver"]));
    expect(eu.body.permissoes).not.toContain("usuarios.ver");
    expect(eu.body.permissoes).not.toContain("os.cancelar");

    const depois = await pool.query(`SELECT permissoes_inicializadas FROM usuarios WHERE id = $1`, [antigo.id]);
    expect(depois.rows[0].permissoes_inicializadas).toBe(true);
    const total = await pool.query(`SELECT COUNT(*)::int n FROM usuario_permissoes WHERE usuario_id = $1`, [antigo.id]);
    expect(total.rows[0].n).toBe(eu.body.permissoes.length);
  });

  it("operador antigo recebe o padrão de operador; gestor antigo recebe tudo", async () => {
    const op = await criarUsuarioTeste(fx.A, { role: "OPERADOR" });
    const ge = await criarUsuarioTeste(fx.A, { role: "GESTOR" });
    const pop = (await chamar(op.token, { metodo: "get", url: "/permissoes/eu" })).body.permissoes;
    const pge = (await chamar(ge.token, { metodo: "get", url: "/permissoes/eu" })).body.permissoes;

    expect(pop).toEqual(expect.arrayContaining(["os.ver", "os.criar"]));
    expect(pop).not.toContain("os.iniciar");
    expect(pge.length).toBe(TODAS_PERMISSOES.length);
  });

  it("o administrador (dono) tem todas, mesmo sem nenhuma linha no banco", async () => {
    const eu = await chamar(fx.A.tokenAdmin, { metodo: "get", url: "/permissoes/eu" });
    expect(eu.body.permissoes.length).toBe(TODAS_PERMISSOES.length);
    const linhas = await pool.query(`SELECT COUNT(*)::int n FROM usuario_permissoes WHERE usuario_id = $1`, [fx.A.adminId]);
    expect(linhas.rows[0].n).toBe(0);
  });

  it("remover TODAS as permissões de alguém não faz o padrão voltar sozinho", async () => {
    const u = await criarUsuarioTeste(fx.A, { role: "TECNICO", permissoes: [] }); // inicializado, vazio
    const eu = await chamar(u.token, { metodo: "get", url: "/permissoes/eu" });
    expect(eu.body.permissoes).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import QRCode from "qrcode";
import request from "supertest";
import { app } from "../src/app";
import { baseDoFront, enderecoDeTeste, urlDaMaquina } from "../src/utils/urlFront";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Etiquetas com QR Code para colar nas máquinas. Pontos críticos: o QR sai do endereço configurado NA HORA
 * da impressão (não do que ficou gravado), só sai máquina da própria empresa, e endereço de teste é sinalizado.
 */

let fx: Fixture;
const ENDERECO = "https://app.exemplo.com.br";
const original = process.env.FRONTEND_URL;

const com = (token: string) => (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
const pedir = (token: string, consulta = "") => com(token)(request(app).get(`/maquinas/etiquetas${consulta}`));

beforeAll(async () => {
  process.env.FRONTEND_URL = ENDERECO;
  fx = await criarFixture();
});

afterAll(async () => {
  if (original === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = original;
  await limparTudo();
  await fecharPool();
});

describe("endereço do sistema (o que vai dentro do QR)", () => {
  it("limpa a barra do fim e aceita http e https", () => {
    expect(baseDoFront("https://app.exemplo.com.br/")).toBe("https://app.exemplo.com.br");
    expect(baseDoFront("  https://app.exemplo.com.br//  ")).toBe("https://app.exemplo.com.br");
    expect(baseDoFront("http://localhost:5173")).toBe("http://localhost:5173");
    expect(baseDoFront("https://exemplo.com.br/sistema/")).toBe("https://exemplo.com.br/sistema");
  });

  it("recusa vazio, texto solto e protocolos que não são web", () => {
    for (const ruim of ["", "   ", "app.exemplo.com.br", "ftp://exemplo.com", "javascript:alert(1)", "undefined"]) {
      expect(baseDoFront(ruim as any), String(ruim)).toBeNull();
    }
  });

  it("monta a página da máquina", () => {
    expect(urlDaMaquina("https://app.exemplo.com.br", 42)).toBe("https://app.exemplo.com.br/machines/42");
  });

  it("marca como teste: localhost, rede local e sem HTTPS; não marca domínio real", () => {
    for (const teste of ["http://localhost:5173", "https://localhost", "http://app.exemplo.com.br", "https://192.168.0.10", "https://10.0.0.5", "https://172.20.1.1", "https://127.0.0.1", "https://servidor.local", "lixo"]) {
      expect(enderecoDeTeste(teste), teste).toBe(true);
    }
    for (const real of ["https://app.exemplo.com.br", "https://sistema.minhaempresa.com", "https://172.15.0.1"]) {
      expect(enderecoDeTeste(real), real).toBe(false);
    }
  });
});

describe("GET /maquinas/etiquetas", () => {
  it("devolve as máquinas da empresa com o QR gerado agora, a partir do endereço configurado", async () => {
    const res = await pedir(fx.A.tokenGestor);

    expect(res.status).toBe(200);
    expect(res.body.base_url).toBe(ENDERECO);
    expect(res.body.endereco_de_teste).toBe(false);
    expect(res.body.empresa).toBe(`${fx.A.marcador}_empresa`);
    expect(res.body.itens).toHaveLength(1);

    const item = res.body.itens[0];
    expect(item).toMatchObject({ id: fx.A.maquinaId, nome: `${fx.A.marcador}_maquina`, setor: `${fx.A.marcador}_setor` });
    expect(item.url).toBe(`${ENDERECO}/machines/${fx.A.maquinaId}`);
    expect(item.qr).toMatch(/^data:image\/png;base64,/);
    // o QR é exatamente o do endereço acima, com correção de erro alta
    expect(item.qr).toBe(await QRCode.toDataURL(item.url, { errorCorrectionLevel: "H", margin: 1, width: 400 }));
  });

  it("se o endereço mudar, a próxima impressão já sai com o novo (não usa o que ficou gravado)", async () => {
    await pool.query(`UPDATE maquinas SET qr_code = 'data:image/png;base64,ANTIGO' WHERE id = $1`, [fx.A.maquinaId]);

    process.env.FRONTEND_URL = "https://novo-dominio.com.br";
    try {
      const res = await pedir(fx.A.tokenGestor);
      expect(res.body.itens[0].url).toBe(`https://novo-dominio.com.br/machines/${fx.A.maquinaId}`);
      expect(res.body.itens[0].qr).not.toContain("ANTIGO");
    } finally {
      process.env.FRONTEND_URL = ENDERECO;
    }
  });

  it("endereço de teste (localhost) é sinalizado para a tela avisar", async () => {
    process.env.FRONTEND_URL = "http://localhost:5173";
    try {
      const res = await pedir(fx.A.tokenGestor);
      expect(res.status).toBe(200);
      expect(res.body.endereco_de_teste).toBe(true);
    } finally {
      process.env.FRONTEND_URL = ENDERECO;
    }
  });

  it("sem endereço configurado não imprime QR quebrado: 503 com explicação", async () => {
    delete process.env.FRONTEND_URL;
    try {
      const res = await pedir(fx.A.tokenGestor);
      expect(res.status).toBe(503);
      expect(String(res.body.message ?? res.body.error)).toMatch(/FRONTEND_URL/);
    } finally {
      process.env.FRONTEND_URL = ENDERECO;
    }
  });

  it("filtra por seleção e por setor", async () => {
    const pelaSelecao = await pedir(fx.A.tokenGestor, `?ids=${fx.A.maquinaId}`);
    expect(pelaSelecao.body.itens.map((i: any) => i.id)).toEqual([fx.A.maquinaId]);

    const peloSetor = await pedir(fx.A.tokenGestor, `?setor_id=${fx.A.setorId}`);
    expect(peloSetor.body.itens.map((i: any) => i.id)).toEqual([fx.A.maquinaId]);

    const outroSetor = await pool.query(`INSERT INTO setores (nome, descricao, empresa_id) VALUES ($1,'x',$2) RETURNING id`, [`${fx.A.marcador}_setor2`, fx.A.empresaId]);
    const vazio = await pedir(fx.A.tokenGestor, `?setor_id=${outroSetor.rows[0].id}`);
    expect(vazio.status).toBe(200);
    expect(vazio.body.itens).toEqual([]);
  });
});

describe("isolamento entre empresas", () => {
  it("cada empresa só recebe as etiquetas das suas máquinas", async () => {
    const a = await pedir(fx.A.tokenGestor);
    const b = await pedir(fx.B.tokenGestor);

    expect(JSON.stringify(a.body)).not.toContain(fx.B.marcador);
    expect(JSON.stringify(b.body)).not.toContain(fx.A.marcador);
    expect(a.body.itens.every((i: any) => i.id !== fx.B.maquinaId)).toBe(true);
    expect(b.body.itens.map((i: any) => i.id)).toContain(fx.B.maquinaId);
  });

  it("pedir a máquina de outra empresa pelo id: não existe (404), sem vazar nada", async () => {
    const res = await pedir(fx.A.tokenGestor, `?ids=${fx.B.maquinaId}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(fx.B.marcador);
  });

  it("misturar ids das duas empresas devolve só os da própria", async () => {
    const res = await pedir(fx.A.tokenGestor, `?ids=${fx.A.maquinaId},${fx.B.maquinaId}`);

    expect(res.status).toBe(200);
    expect(res.body.itens.map((i: any) => i.id)).toEqual([fx.A.maquinaId]);
  });

  it("setor de outra empresa não devolve máquina nenhuma", async () => {
    const res = await pedir(fx.A.tokenGestor, `?setor_id=${fx.B.setorId}`);

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });

  it("token de outra empresa com o id trocado no corpo do token não enxerga a máquina", async () => {
    // o administrador da B também só vê o que é da B
    const res = await pedir(fx.B.tokenAdmin, `?ids=${fx.A.maquinaId}`);
    expect(res.status).toBe(404);
  });
});

describe("quem pode imprimir e entradas inválidas", () => {
  it("sem token: 401", async () => {
    expect((await request(app).get("/maquinas/etiquetas")).status).toBe(401);
  });

  it("técnico e operador não têm 'cadastrar máquinas': 403", async () => {
    expect((await pedir(fx.A.tokenTecnico)).status).toBe(403);
    expect((await pedir(fx.A.tokenOperador)).status).toBe(403);
  });

  it("gestor e administrador imprimem", async () => {
    expect((await pedir(fx.A.tokenGestor)).status).toBe(200);
    expect((await pedir(fx.A.tokenAdmin)).status).toBe(200);
  });

  it.each([
    ["ids com letras", "?ids=abc"],
    ["ids vazio", "?ids="],
    ["ids com zero", "?ids=0"],
    ["ids negativo", "?ids=-1"],
    ["ids com ponto e vírgula", "?ids=1;2"],
    ["ids com injeção de SQL", "?ids=1);DROP TABLE maquinas;--"],
    ["ids enorme", "?ids=99999999999999999999"],
    ["ids repetido como lista", "?ids=1&ids=2"],
    ["setor com letras", "?setor_id=x"],
    ["setor com injeção de SQL", "?setor_id=1 OR 1=1"],
  ])("entrada inválida: %s (400)", async (_n, consulta) => {
    expect((await pedir(fx.A.tokenGestor, consulta)).status).toBe(400);
    expect((await pool.query(`SELECT to_regclass('maquinas') r`)).rows[0].r).not.toBeNull();
  });

  it("ids repetidos viram uma etiqueta só", async () => {
    const res = await pedir(fx.A.tokenGestor, `?ids=${fx.A.maquinaId},${fx.A.maquinaId}`);
    expect(res.body.itens).toHaveLength(1);
  });
});

describe("cadastro de máquina e o QR gravado", () => {
  const cadastrar = (nome = `${fx.A.marcador}_nova`) =>
    com(fx.A.tokenGestor)(request(app).post("/maquinas"))
      .field("nome", nome)
      .field("modelo", "Modelo X")
      .field("fabricante", "Fabricante")
      .field("ano", "2024")
      .field("status", "ativa")
      .field("setor_id", String(fx.A.setorId))
      .field("intervalo_manutencao_dias", "90")
      .field("ultima_manutencao", "2026-01-01");

  it("com o endereço configurado, grava o QR do endereço certo", async () => {
    const res = await cadastrar();

    expect(res.status).toBe(201);
    expect(res.body.qr_code).toBe(await QRCode.toDataURL(`${ENDERECO}/machines/${res.body.id}`));
  });

  it("sem endereço configurado, cadastra normalmente e NÃO grava um QR quebrado", async () => {
    delete process.env.FRONTEND_URL;
    try {
      const res = await cadastrar(`${fx.A.marcador}_sem_endereco`);

      expect(res.status).toBe(201);
      expect(res.body.qr_code).toBeUndefined();
      const { rows } = await pool.query(`SELECT qr_code FROM maquinas WHERE id = $1`, [res.body.id]);
      expect(rows[0].qr_code).toBeNull();
    } finally {
      process.env.FRONTEND_URL = ENDERECO;
    }
  });
});

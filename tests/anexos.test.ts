import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Storage falso: nunca sobe/remove arquivo de verdade no Supabase.
const removerMock = vi.fn(async () => ({ error: null }));
vi.mock("../src/config/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `http://storage.fake/${p}` } }),
        remove: removerMock,
      }),
    },
  },
}));

import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

beforeAll(async () => {
  fx = await criarFixture();
});

beforeEach(() => {
  removerMock.mockClear();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("upload de anexos", () => {
  it("A anexa arquivo na própria máquina (201, gravado na empresa A)", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("origem", "MAQUINA")
      .field("maquina_id", String(fx.A.maquinaId))
      .attach("arquivo", PNG, { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT empresa_id FROM anexos WHERE id = $1`, [res.body.id]);
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);
  });

  it("A anexa arquivo na própria O.S.", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("origem", "OS_ABERTURA")
      .field("ordem_servico_id", String(fx.A.osId))
      .attach("arquivo", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(res.status).toBe(201);
  });

  it("B NÃO anexa arquivo na máquina da A", async () => {
    const res = await comoB(request(app).post("/anexos/upload"))
      .field("origem", "MAQUINA")
      .field("maquina_id", String(fx.A.maquinaId))
      .attach("arquivo", PNG, { filename: "invasor.png", contentType: "image/png" });

    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM anexos WHERE nome_arquivo = 'invasor.png'`);
    expect(rows[0].n).toBe(0);
    expect(res.status).not.toBe(201);
  });

  it("B NÃO anexa arquivo na O.S. da A", async () => {
    const res = await comoB(request(app).post("/anexos/upload"))
      .field("origem", "OS_FECHAMENTO")
      .field("ordem_servico_id", String(fx.A.osId))
      .attach("arquivo", PNG, { filename: "invasor2.png", contentType: "image/png" });

    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM anexos WHERE nome_arquivo = 'invasor2.png'`);
    expect(rows[0].n).toBe(0);
    expect(res.status).not.toBe(201);
  });

  it("tipo de arquivo não permitido é recusado", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("origem", "MAQUINA")
      .field("maquina_id", String(fx.A.maquinaId))
      .attach("arquivo", Buffer.from("echo oi"), { filename: "script.sh", contentType: "text/x-sh" });
    expect(res.status).toBe(400);
  });

  it("arquivo acima de 15MB devolve 413", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("origem", "MAQUINA")
      .field("maquina_id", String(fx.A.maquinaId))
      .attach("arquivo", Buffer.alloc(16 * 1024 * 1024), { filename: "grande.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("sem arquivo devolve 400", async () => {
    const res = await comoA(request(app).post("/anexos/upload"))
      .field("origem", "MAQUINA")
      .field("maquina_id", String(fx.A.maquinaId));
    expect(res.status).toBe(400);
  });
});

describe("anexos de outra empresa", () => {
  let anexoId: number;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO anexos (maquina_id, nome_arquivo, caminho_arquivo, url_arquivo, tipo_arquivo, origem, empresa_id)
       VALUES ($1,$2,'maquina/x/a.png','http://storage.fake/a.png','image/png','MAQUINA',$3) RETURNING id`,
      [fx.A.maquinaId, `${fx.A.marcador}_anexo.png`, fx.A.empresaId]
    );
    anexoId = rows[0].id;
  });

  it("B não lista os anexos da máquina da A", async () => {
    const res = await comoB(request(app).get(`/anexos/maquina/${fx.A.maquinaId}`));
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });

  it("B não lista os anexos da O.S. da A", async () => {
    const res = await comoB(request(app).get(`/anexos/os/${fx.A.osId}`));
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });

  it("B não lê o anexo da A pelo id", async () => {
    const res = await comoB(request(app).get(`/anexos/${anexoId}`));
    expect(res.status).not.toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(fx.A.marcador);
  });

  it("B não apaga o anexo da A (nem o arquivo no storage)", async () => {
    await comoB(request(app).delete(`/anexos/${anexoId}`));
    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM anexos WHERE id = $1`, [anexoId]);
    expect(rows[0].n).toBe(1);
    expect(removerMock).not.toHaveBeenCalled();
  });

  it("A apaga o próprio anexo", async () => {
    const res = await comoA(request(app).delete(`/anexos/${anexoId}`));
    expect(res.status).toBe(204);
    expect(removerMock).toHaveBeenCalledTimes(1);
  });
});

describe("imagem da máquina", () => {
  it("A cria máquina com imagem (gravada na empresa A)", async () => {
    const nome = `${fx.A.marcador}_maquina_com_imagem`;
    const res = await comoA(request(app).post("/maquinas"))
      .field("nome", nome)
      .field("modelo", "M1")
      .field("setor_id", String(fx.A.setorId))
      .attach("imagem", PNG, { filename: "m.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT empresa_id, imagem_url FROM maquinas WHERE nome = $1`, [nome]);
    expect(rows[0].empresa_id).toBe(fx.A.empresaId);
    expect(rows[0].imagem_url).toContain("storage.fake");
  });
});

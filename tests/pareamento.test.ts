import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, pool, Fixture } from "./helpers/fixture";

/**
 * Pareamento de ESP32 com uma máquina via PIN: usuário logado gera um
 * código de 6 dígitos (POST /maquinas/:id/pareamento), a placa resgata
 * esse código SEM login (POST /dispositivos/parear) e descobre qual
 * maquina_id deve monitorar.
 */

let fx: Fixture;
const comoA = (r: request.Test) => r.set("Authorization", `Bearer ${fx.A.tokenAdmin}`);
const comoB = (r: request.Test) => r.set("Authorization", `Bearer ${fx.B.tokenAdmin}`);

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("POST /maquinas/:id/pareamento — gerar PIN", () => {
  it("gera um código de 6 dígitos numéricos com validade", async () => {
    const res = await comoA(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`));
    expect(res.status).toBe(201);
    expect(res.body.codigo).toMatch(/^[0-9]{6}$/);
    expect(new Date(res.body.expira_em).getTime()).toBeGreaterThan(Date.now());
  });

  it("empresa B não consegue gerar PIN pra máquina da empresa A", async () => {
    const res = await comoB(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`));
    expect(res.status).toBe(400);
  });

  it("sem permissão de editar máquina recebe 403", async () => {
    const res = await request(app)
      .post(`/maquinas/${fx.A.maquinaId}/pareamento`)
      .set("Authorization", `Bearer ${fx.A.tokenOperador}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /dispositivos/parear — resgate público (sem login)", () => {
  it("troca o PIN válido pelo maquina_id certo, sem precisar de token", async () => {
    const gerado = await comoA(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`));
    const codigo = gerado.body.codigo;

    const res = await request(app)
      .post("/dispositivos/parear")
      .send({ codigo, mac: "AA:BB:CC:DD:EE:FF" });

    expect(res.status).toBe(200);
    expect(res.body.maquina_id).toBe(fx.A.maquinaId);
    expect(res.body.maquina_nome).toBeTruthy();
  });

  it("o mesmo PIN não pode ser resgatado duas vezes", async () => {
    const gerado = await comoA(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`));
    const codigo = gerado.body.codigo;

    const primeira = await request(app).post("/dispositivos/parear").send({ codigo });
    expect(primeira.status).toBe(200);

    const segunda = await request(app).post("/dispositivos/parear").send({ codigo });
    expect(segunda.status).toBe(400);
  });

  it("código inexistente/expirado -> 400", async () => {
    const res = await request(app).post("/dispositivos/parear").send({ codigo: "999999" });
    expect(res.status).toBe(400);
  });

  it("formato de código inválido -> 400", async () => {
    const res = await request(app).post("/dispositivos/parear").send({ codigo: "abc" });
    expect(res.status).toBe(400);
  });

  it("gerar um PIN novo invalida o anterior da mesma máquina", async () => {
    const primeiro = await comoA(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`));
    await comoA(request(app).post(`/maquinas/${fx.A.maquinaId}/pareamento`)); // gera outro, invalida o 1º

    const res = await request(app)
      .post("/dispositivos/parear")
      .send({ codigo: primeiro.body.codigo });
    expect(res.status).toBe(400);
  });
});

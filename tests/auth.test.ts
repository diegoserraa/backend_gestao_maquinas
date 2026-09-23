import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { criarFixture, fecharPool, limparTudo, Fixture, SENHA } from "./helpers/fixture";

let fx: Fixture;

beforeAll(async () => {
  fx = await criarFixture();
});

afterAll(async () => {
  await limparTudo();
  await fecharPool();
});

describe("autenticação", () => {
  const rotas = [
    "/maquinas",
    "/setores",
    "/usuarios",
    "/ordens-servico",
    "/parceiros",
    "/notificacoes",
    "/telemetria",
    "/monitoramento/alertas",
    "/dashboard/gestor/kpis",
    "/relatorios/ordens-servico/preview",
  ];

  it.each(rotas)("%s sem token devolve 401", async (rota) => {
    const res = await request(app).get(rota);
    expect(res.status).toBe(401);
  });

  it("token inválido devolve 401", async () => {
    const res = await request(app).get("/maquinas").set("Authorization", "Bearer lixo");
    expect(res.status).toBe(401);
  });

  it("token assinado com outro segredo devolve 401", async () => {
    const falso = jwt.sign({ id: 1, role: "ADMIN", empresa_id: fx.A.empresaId }, "outro-segredo");
    const res = await request(app).get("/maquinas").set("Authorization", `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it("login correto devolve token com empresa_id da empresa do usuário", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: fx.A.adminEmail, senha: SENHA });
    expect(res.status).toBe(200);
    expect(res.body.user.empresa_id).toBe(fx.A.empresaId);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as any;
    expect(payload.empresa_id).toBe(fx.A.empresaId);
  });

  it("login com senha errada não devolve token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: fx.A.adminEmail, senha: "errada" });
    expect(res.status).not.toBe(200);
    expect(res.body.token).toBeUndefined();
  });
});

describe("papéis (roles)", () => {
  it("TECNICO não pode criar setor", async () => {
    const res = await request(app)
      .post("/setores")
      .set("Authorization", `Bearer ${fx.A.tokenTecnico}`)
      .send({ nome: `${fx.A.marcador}_setor_proibido` });
    expect(res.status).toBe(403);
  });

  it("TECNICO não pode criar usuário", async () => {
    const res = await request(app)
      .post("/usuarios")
      .set("Authorization", `Bearer ${fx.A.tokenTecnico}`)
      .send({ nome: "x", email: "x@vitest.local", senha: "123456", role: "ADMIN" });
    expect(res.status).toBe(403);
  });

  it("TECNICO não acessa o dashboard do gestor", async () => {
    const res = await request(app)
      .get("/dashboard/gestor/kpis")
      .set("Authorization", `Bearer ${fx.A.tokenTecnico}`);
    expect(res.status).toBe(403);
  });
});

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../src/database/connection";

/**
 * Cria DUAS empresas descartáveis (A e B) com dados próprios e apaga tudo
 * no final. Tudo que os testes criam leva o prefixo abaixo, então uma
 * limpeza nunca encosta em dado real.
 */
export const PREFIXO = "__TESTE_VITEST__";
export const SENHA = "Teste@123";

export interface Lado {
  empresaId: string;
  setorId: number;
  maquinaId: number;
  osId: number;
  parceiroId: number;
  adminId: number;
  tecnicoId: number;
  notificacaoId: number;
  adminEmail: string;
  tokenAdmin: string;
  tokenTecnico: string;
  marcador: string;
}

export interface Fixture {
  A: Lado;
  B: Lado;
}

const TABELAS_POR_EMPRESA = [
  "telemetria_alertas",
  "telemetria_alerta_estado",
  "telemetria_atual",
  "telemetria_leituras",
  "maquina_parametros",
  "anexos",
  "notificacoes",
  "push_subscriptions",
  "ordens_servico",
  "maquinas",
  "setores",
  "parceiros",
  "usuarios",
];

function token(id: number, role: string, empresaId: string) {
  return jwt.sign({ id, role, empresa_id: empresaId }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
}

async function criarLado(letra: "A" | "B", hash: string): Promise<Lado> {
  const marcador = `${PREFIXO}${letra}`;

  const emp = await pool.query(
    `INSERT INTO empresas (nome) VALUES ($1) RETURNING id`,
    [`${marcador}_empresa`]
  );
  const empresaId: string = emp.rows[0].id;

  const insUser = async (papel: string, role: string) => {
    const email = `${marcador.toLowerCase()}_${papel}@vitest.local`;
    const r = await pool.query(
      `INSERT INTO usuarios (nome, email, senha, role, empresa_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [`${marcador}_${papel}`, email, hash, role, empresaId]
    );
    return { id: r.rows[0].id as number, email };
  };

  const admin = await insUser("admin", "ADMIN");
  const tecnico = await insUser("tecnico", "TECNICO");

  const setor = await pool.query(
    `INSERT INTO setores (nome, descricao, empresa_id) VALUES ($1,$2,$3) RETURNING id`,
    [`${marcador}_setor`, "setor de teste", empresaId]
  );

  const maq = await pool.query(
    `INSERT INTO maquinas (nome, modelo, fabricante, ano, setor_id, status, empresa_id)
     VALUES ($1,'Modelo','Fab',2024,$2,'ativa',$3) RETURNING id`,
    [`${marcador}_maquina`, setor.rows[0].id, empresaId]
  );

  const parc = await pool.query(
    `INSERT INTO parceiros (nome, cnpj, empresa_id) VALUES ($1,$2,$3) RETURNING id`,
    [`${marcador}_parceiro`, letra === "A" ? "00000000000001" : "00000000000002", empresaId]
  );

  const os = await pool.query(
    `INSERT INTO ordens_servico
       (maquina_id, descricao, status, tipo_manutencao, prioridade, data_abertura, id_solicitante, empresa_id)
     VALUES ($1,$2,'ABERTA','CORRETIVA','ALTA', NOW(), $3, $4) RETURNING id`,
    [maq.rows[0].id, `${marcador}_os`, admin.id, empresaId]
  );

  const notif = await pool.query(
    `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, empresa_id)
     VALUES ($1,$2,'mensagem','INFO',$3) RETURNING id`,
    [admin.id, `${marcador}_notificacao`, empresaId]
  );

  await pool.query(
    `INSERT INTO telemetria_atual (maquina_id, temperatura, vibracao, horas_ligadas, empresa_id)
     VALUES ($1, 50, 1, 10, $2)`,
    [maq.rows[0].id, empresaId]
  );

  return {
    empresaId,
    setorId: setor.rows[0].id,
    maquinaId: maq.rows[0].id,
    osId: os.rows[0].id,
    parceiroId: parc.rows[0].id,
    adminId: admin.id,
    tecnicoId: tecnico.id,
    notificacaoId: notif.rows[0].id,
    adminEmail: admin.email,
    tokenAdmin: token(admin.id, "ADMIN", empresaId),
    tokenTecnico: token(tecnico.id, "TECNICO", empresaId),
    marcador,
  };
}

/** Apaga qualquer resto de execuções anteriores que tenham quebrado no meio. */
export async function limparTudo(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id FROM empresas WHERE nome LIKE $1`,
    [`${PREFIXO}%`]
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  for (const t of TABELAS_POR_EMPRESA) {
    await pool.query(`DELETE FROM ${t} WHERE empresa_id = ANY($1::uuid[])`, [ids]);
  }
  await pool.query(`DELETE FROM empresas WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function criarFixture(): Promise<Fixture> {
  await limparTudo();
  const hash = await bcrypt.hash(SENHA, 4);
  const A = await criarLado("A", hash);
  const B = await criarLado("B", hash);
  return { A, B };
}

export async function fecharPool(): Promise<void> {
  await pool.end();
}

export { pool };

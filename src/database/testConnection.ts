import { pool } from "./connection";

export async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");

        console.log("Banco conectado!");
        console.log(result.rows[0]);
    } catch (error) {
        console.error("Erro ao conectar no banco:");
        console.error(error);
    }
}
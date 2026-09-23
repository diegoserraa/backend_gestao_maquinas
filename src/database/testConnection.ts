import { pool } from "./connection";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "database" });

export async function testConnection() {
    try {
        const result = await pool.query(`
            SELECT
                NOW() as agora,
                current_setting('TIMEZONE') as timezone
        `);

        log.info({ agora: result.rows[0].agora, timezone: result.rows[0].timezone }, "conexão com o banco ok");
    } catch (error) {
        log.error({ err: error }, "falha ao conectar com o banco");
    }
}

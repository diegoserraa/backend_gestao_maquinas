import { pool } from "./connection";

export async function testConnection() {
    try {
        const result = await pool.query(`
            SELECT 
                NOW() as agora,
                CURRENT_TIME as hora,
                current_setting('TIMEZONE') as timezone
        `);

        console.log(result.rows[0]);
    } catch (error) {
        console.error(error);
    }
}
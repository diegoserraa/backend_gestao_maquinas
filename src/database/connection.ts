import dotenv from "dotenv";
import { Pool } from "pg";
import { logger } from "../config/logger";

dotenv.config();

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    options: "-c timezone=America/Sao_Paulo"
});

// Sem este ouvinte, uma conexão ociosa que o banco derruba (rede, reinício do Supabase)
// emite um evento "error" sem tratamento e derruba o processo inteiro do servidor.
// O pool descarta a conexão ruim sozinho e abre outra na próxima consulta.
pool.on("error", (erro) => {
    logger.error({ err: erro }, "conexão ociosa com o banco foi derrubada");
});

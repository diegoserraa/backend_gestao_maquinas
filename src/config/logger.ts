import pino from "pino";

/**
 * Logger central da aplicação. JSON estruturado sempre — em dev fica
 * bonito no terminal (pino-pretty), em produção sai JSON puro, pronto
 * pra mandar direto pra um serviço de log (Better Stack, Axiom, etc.)
 * sem precisar mudar nada aqui depois.
 *
 * Uso: logger.info({ maquinaId, empresaId }, "mensagem"); nunca
 * console.log — assim todo campo extra fica pesquisável, não só texto solto.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport:
        process.env.NODE_ENV === "production"
            ? undefined
            : {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "HH:MM:ss",
                      ignore: "pid,hostname",
                  },
              },
});

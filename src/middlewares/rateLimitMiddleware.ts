import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { logger } from "../config/logger";

// log próprio (não é um erro da aplicação, é alguém batendo no limite —
// vale registrar separado pra dar pra notar um padrão de ataque depois).
function logBloqueio(tipo: string) {
    return (req: Request, res: Response) => {
        logger.warn({ tipo, ip: req.ip, path: req.path }, "rate limit atingido");
        res.status(429).json(
            tipo === "login"
                ? { message: "Muitas tentativas de login. Tente novamente em alguns minutos." }
                : { message: "Muitas requisições. Tente novamente em instantes." }
        );
    };
}

/**
 * Limite geral: evita que uma única origem martele a API até derrubar o
 * servidor. Generoso o bastante pra não atrapalhar uso normal (o
 * dashboard sozinho dispara várias chamadas em paralelo).
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: logBloqueio("api"),
});

/**
 * Limite estrito só no login — é o único endpoint onde força bruta de
 * senha faz sentido pra um atacante. 10 tentativas por 15 min por IP.
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: logBloqueio("login"),
});

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
    // os testes automatizados fazem centenas de chamadas por minuto de um único IP
    skip: () => process.env.NODE_ENV === "test",
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

/**
 * Limite de tentativas de trocar a própria senha (10 a cada 15 min por usuário): a senha atual é
 * pedida justamente para que uma sessão esquecida aberta não baste para tomar a conta, e este
 * limite impede adivinhá-la. Vale também nos testes automatizados (a menos que se peça o contrário).
 */
export function limitadorDeTrocaDeSenha(limite = Number(process.env.TROCA_SENHA_LIMITE) || 10, janelaMs = 15 * 60 * 1000) {
    return rateLimit({
        windowMs: janelaMs,
        limit: limite,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => `senha:${req.user?.id ?? "anonimo"}`,
        handler: logBloqueio("troca-de-senha"),
    });
}

/**
 * Limite para AÇÕES do painel do administrador que criam coisas (empresas): mesmo com o token certo,
 * um token vazado não pode sair cadastrando empresas em massa. Conta por usuário (não por IP).
 * No teste automatizado o limite geral é ignorado, mas este vale (a menos que se peça o contrário).
 */
export function limitadorDeCriacaoAdmin(limite = Number(process.env.ADMIN_CRIACAO_LIMITE) || 30, janelaMs = 60 * 60 * 1000) {
    return rateLimit({
        windowMs: janelaMs,
        limit: limite,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => `admin:${req.user?.id ?? "anonimo"}`,
        handler: logBloqueio("api-admin"),
    });
}

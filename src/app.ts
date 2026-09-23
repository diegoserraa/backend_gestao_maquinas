import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import pinoHttp from "pino-http";
import { router } from "./routes";
import { authRoutes } from "./routes/auth.routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { apiLimiter, loginLimiter } from "./middlewares/rateLimitMiddleware";
import { logger } from "./config/logger";

const app = express();


// Headers de segurança padrão (proteção contra clickjacking, MIME
// sniffing, etc.) — antes não tinha nenhum.
app.use(helmet());

app.use(
  cors({
    origin:["https://frontend-gestao-maquinas.vercel.app","http://localhost:4173",
      "http://localhost:5173"],
  })
);

app.use(express.json());

// log de toda requisição (método, rota, status, tempo de resposta) — não
// existia nenhuma visão disso antes. Por padrão o pino-http despeja todo
// header de req/res (inclusive os do helmet) em cada linha — enxugado
// aqui pro que realmente importa no dia a dia.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

// health-check simples pra monitoramento externo (UptimeRobot etc.) —
// antes não existia nenhuma forma de saber "o servidor está de pé?"
// sem chamar uma rota de negócio.
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// limite geral pra API inteira, antes de qualquer rota
app.use(apiLimiter);

// única rota pública: login. Tudo abaixo exige token válido.
// limite mais estrito aqui — é o único endpoint onde força bruta faz sentido.
app.use("/auth", loginLimiter, authRoutes);

app.use(authMiddleware);

app.use(router);

// Handler de erro global — vários controllers não tratam erro (ex.:
// buscarPorId de vários recursos), e sem isso o Express devolve a página
// de erro padrão em HTML com o stack trace completo (caminho de arquivo,
// linha) exposto pra qualquer cliente. Express 5 encaminha rejeições de
// handlers async pra cá automaticamente, então isso cobre a aplicação
// inteira sem precisar de try/catch em cada controller.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "erro não tratado");

  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "Arquivo muito grande. O limite é de 15MB.",
    });
  }

  res.status(err.status ?? 400).json({
    message: err.message || "Erro interno",
  });
});

export { app };
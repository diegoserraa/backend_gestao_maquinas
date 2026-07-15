import express from "express";
import cors from "cors";
import { router } from "./routes";

const app = express();

/**
 * ✔ CORS TEM QUE VIR ANTES DAS ROTAS
 */
app.use(
  cors({
    origin:["https://frontend-gestao-maquinas-8p7w-plum.vercel.app",
      "http://localhost:5173"],
  })
);

app.use(express.json());

app.use(router);

export { app };
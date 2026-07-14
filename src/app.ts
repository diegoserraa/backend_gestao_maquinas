import express from "express";
import cors from "cors";
import { router } from "./routes";

const app = express();

/**
 * ✔ CORS TEM QUE VIR ANTES DAS ROTAS
 */
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

app.use(router);

export { app };
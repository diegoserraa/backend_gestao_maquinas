import express from "express";
import cors from "cors";
import { router } from "./routes";

const app = express();


app.use(
  cors({
    origin:["https://frontend-gestao-maquinas.vercel.app","http://localhost:4173",
      "http://localhost:5173"],
  })
);

app.use(express.json());

app.use(router);

export { app };
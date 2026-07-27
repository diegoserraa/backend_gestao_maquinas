import dotenv from "dotenv";

dotenv.config();

import { app } from "./app";
import { testConnection } from "./database/testConnection";
import "./jobs/manutencaoPreventiva.job";


const PORT = process.env.PORT || 3000;


testConnection();


app.listen(PORT, () => {
    console.log(
        `Servidor rodando na porta ${PORT}`
    );
});
import dotenv from "dotenv";
import { app } from "./app";
import { testConnection } from "./database/testConnection";

dotenv.config();

const PORT = process.env.PORT || 3000;

testConnection();

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
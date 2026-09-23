import dotenv from "dotenv";

dotenv.config({ quiet: true });

// sem ruído de log durante os testes
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "segredo-de-teste";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // os testes criam dezenas de empresas; o limite real (30/h) é testado à parte, num app isolado
    env: { ADMIN_CRIACAO_LIMITE: "100000", TROCA_SENHA_LIMITE: "100000" },
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, somenteDigitos } from "../src/utils/cnpj";

describe("CNPJ", () => {
  it("aceita CNPJs válidos, com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("  11.222.333/0001-81  ")).toBe(true);
    expect(cnpjValido("00.000.000/0001-91")).toBe(true); // Banco do Brasil (válido)
  });

  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("11.222.333/0001-91")).toBe(false);
    expect(cnpjValido("11222333000180")).toBe(false);
  });

  it("recusa tamanho errado, letras e vazio", () => {
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("112223330001811")).toBe(false);
    expect(cnpjValido("ABCDEFGHIJKLMN")).toBe(false);
  });

  it("recusa sequências repetidas (passam na conta, mas não existem)", () => {
    for (let d = 0; d <= 9; d++) expect(cnpjValido(String(d).repeat(14))).toBe(false);
  });

  it("todos os CNPJs que o gerador de teste cria são válidos (confere o algoritmo dos dois lados)", () => {
    const dv = (digs: number[], pesos: number[]) => {
      const r = digs.reduce((s, d, i) => s + d * pesos[i], 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    for (let i = 0; i < 300; i++) {
      const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
      const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const d2 = dv([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const cnpj = [...base, d1, d2].join("");
      if (/^(\d)\1{13}$/.test(cnpj)) continue;
      expect(cnpjValido(cnpj), cnpj).toBe(true);
    }
  });

  it("somenteDigitos e formatarCnpj", () => {
    expect(somenteDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("123")).toBe("123");
  });
});

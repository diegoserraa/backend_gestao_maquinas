/** CNPJ: só dígitos, validação dos dois dígitos verificadores e formatação. */

export const somenteDigitos = (valor: string): string => valor.replace(/\D/g, "");

function digitoVerificador(base: string): number {
    // pesos 5..2,9..2 (13 dígitos usa 6..2,9..2): o mesmo algoritmo, com o primeiro peso variando
    let peso = base.length - 7;
    let soma = 0;

    for (const d of base) {
        soma += Number(d) * peso--;
        if (peso < 2) peso = 9;
    }

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

/** true se tem 14 dígitos, não é uma sequência repetida e os dígitos verificadores conferem. */
export function cnpjValido(valor: string): boolean {
    const cnpj = somenteDigitos(valor);

    if (cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const base = cnpj.slice(0, 12);
    const d1 = digitoVerificador(base);
    const d2 = digitoVerificador(base + d1);

    return cnpj === `${base}${d1}${d2}`;
}

export function formatarCnpj(valor: string): string {
    const c = somenteDigitos(valor);
    return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : valor;
}

/**
 * Endereço do front-end (o que vai dentro do QR Code colado na máquina). Fica num lugar só para o QR de
 * hoje e o de amanhã sempre saírem do mesmo endereço configurado (FRONTEND_URL).
 */

/** Endereço base já limpo (sem barra no fim), ou null se não estiver configurado ou não for uma URL http(s). */
export function baseDoFront(valor: string | undefined = process.env.FRONTEND_URL): string | null {
    const texto = valor?.trim();
    if (!texto) return null;

    try {
        const url = new URL(texto);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;

        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
        return null;
    }
}

/** Página da máquina no front (é o que o QR abre). */
export const urlDaMaquina = (base: string, maquinaId: number): string => `${base}/machines/${maquinaId}`;

/**
 * Endereço que não serve para imprimir: computador do desenvolvedor, rede local ou sem HTTPS.
 * O QR colado na máquina precisa apontar para o endereço definitivo do sistema.
 */
export function enderecoDeTeste(base: string): boolean {
    try {
        const { hostname, protocol } = new URL(base);

        if (protocol !== "https:") return true;
        if (hostname === "localhost" || hostname.endsWith(".local")) return true;
        if (/^(127|10)\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;

        return false;
    } catch {
        return true;
    }
}

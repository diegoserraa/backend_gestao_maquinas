/** Erro com status HTTP — o handler global em app.ts usa `status` na resposta. */
export class ErroHttp extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "ErroHttp";
    }
}

export const proibido = (mensagem = "Acesso negado") => new ErroHttp(403, mensagem);
export const naoEncontrado = (mensagem: string) => new ErroHttp(404, mensagem);
export const invalido = (mensagem: string) => new ErroHttp(400, mensagem);

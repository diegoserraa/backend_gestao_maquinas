import { TokenPayload } from "./auth";

// Amplia o Request do Express para carregar o usuário autenticado
// (preenchido pelo authMiddleware) — hoje isso não existia e req.user
// era implicitamente "any" em todo o código.
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
            /** Atalho pra req.user.empresa_id, já pronto pro filtro de tenant. */
            empresaId?: string;
        }
    }
}

export {};

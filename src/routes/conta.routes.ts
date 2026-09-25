import { Request, Response, Router } from "express";
import { validarBody } from "../middlewares/validate";
import { limitadorDeTrocaDeSenha } from "../middlewares/rateLimitMiddleware";
import { trocarSenhaSchema } from "../schemas/conta";
import { ContaService } from "../services/ContaService";

/** Conta do próprio usuário logado (qualquer perfil, sem permissão especial). */
const contaRoutes = Router();
const service = new ContaService();

// limite por usuário: quem pegou uma sessão aberta não pode ficar adivinhando a senha atual
contaRoutes.patch("/senha", limitadorDeTrocaDeSenha(), validarBody(trocarSenhaSchema), async (req: Request, res: Response) => {
    const token = await service.trocarSenha(
        { id: req.user!.id, role: req.user!.role, empresaId: req.empresaId! },
        req.body.senha_atual,
        req.body.nova_senha
    );

    // token novo para esta sessão continuar; todos os antigos foram encerrados
    return res.json({ token });
});

export { contaRoutes };

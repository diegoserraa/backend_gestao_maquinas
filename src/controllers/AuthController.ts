import { Request, Response } from "express";
import { AuthService } from "../services/AuthService";

export class AuthController {

    private service = new AuthService();

    login = async (req: Request, res: Response) => {
        try {
            const { email, senha } = req.body;

            const result = await this.service.login(email, senha);

            return res.json(result);

        } catch (err: any) {
            return res.status(400).json({
                error: err.message
            });
        }
    };
}
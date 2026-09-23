import { Router } from "express";
import { validarBody } from "../middlewares/validate";
import { loginSchema } from "../schemas/auth";
import { AuthController } from "../controllers/AuthController";

const router = Router();
const controller = new AuthController();

router.post("/login", validarBody(loginSchema), controller.login);

export { router as authRoutes };
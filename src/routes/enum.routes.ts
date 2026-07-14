import { Router } from "express";
import { EnumController } from "../controllers/EnumController";

const enumRoutes = Router();
const enumController = new EnumController();

enumRoutes.get("/os", enumController.listarOS);

export { enumRoutes };
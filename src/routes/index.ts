import { Router } from "express";
import { maquinaRoutes } from "./maquina.routes";
import { setorRoutes } from "./setor.routes";
import { ordemServicoRoutes } from "./ordemServico.routes";
import { enumRoutes } from "./enum.routes";
import { usuarioRoutes } from "./usuario.routes";
import { authRoutes } from "./auth.routes";
import { anexoRoutes } from "./anexo.routes";
import { parceiroRoutes } from "./parceiro.routes";

const router = Router();

router.use("/maquinas",maquinaRoutes);
router.use("/setores", setorRoutes);
router.use("/ordens-servico", ordemServicoRoutes);
router.use("/enums", enumRoutes);
router.use("/usuarios", usuarioRoutes);
router.use("/auth", authRoutes);
router.use('/anexos', anexoRoutes);
router.use('/parceiros', parceiroRoutes);

export { router };
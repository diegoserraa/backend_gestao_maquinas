import { Router } from "express";
import { maquinaRoutes } from "./maquina.routes";
import { setorRoutes } from "./setor.routes";
import { ordemServicoRoutes } from "./ordemServico.routes";
import { enumRoutes } from "./enum.routes";
import { usuarioRoutes } from "./usuario.routes";
import { anexoRoutes } from "./anexo.routes";
import { parceiroRoutes } from "./parceiro.routes";
import { notificacaoRoutes } from "./notificacao.routes";
import { pushSubscriptionRoutes } from "./pushSubscription.routes";
import { dashboardRoutes } from "./dashboard.routes";
import { relatorioRoutes } from "./relatorio.routes";
import { telemetriaRoutes } from "./telemetria.routes";
import { monitoramentoRoutes } from "./monitoramento.routes";
import { permissaoRoutes } from "./permissao.routes";
const router = Router();

router.use("/maquinas",maquinaRoutes);
router.use("/setores", setorRoutes);
router.use("/ordens-servico", ordemServicoRoutes);
router.use("/enums", enumRoutes);
router.use("/usuarios", usuarioRoutes);
router.use('/anexos', anexoRoutes);
router.use('/parceiros', parceiroRoutes);
router.use('/notificacoes', notificacaoRoutes);
router.use('/push-subscriptions', pushSubscriptionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/relatorios', relatorioRoutes)
router.use('/telemetria', telemetriaRoutes);
router.use('/monitoramento', monitoramentoRoutes);
router.use('/permissoes', permissaoRoutes);

export { router };
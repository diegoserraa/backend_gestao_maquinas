import cron from "node-cron";

import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";

import { ManutencaoPreventivaService } from "../services/ManutencaoPreventivaService";
import { NotificacaoSistemaService } from "../services/notificacaoSistemaService";

import { NotificacaoService } from "../services/NotificacaoService";
import { PushNotificationService } from "../services/PushNotificationService";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "job-preventiva" });

const maquinaRepository =
    new MaquinaRepository();

const ordemServicoRepository =
    new OrdemServicoRepository();

const usuarioRepository =
    new UsuarioRepository();


const notificacaoService =
    new NotificacaoService();

const pushNotificationService =
    new PushNotificationService();


const notificacaoSistemaService =
    new NotificacaoSistemaService(
        notificacaoService,
        pushNotificationService
    );


const service =
    new ManutencaoPreventivaService(
        maquinaRepository,
        ordemServicoRepository,
        usuarioRepository,
        notificacaoSistemaService
    );


log.info("job de manutenção preventiva carregado");

cron.schedule(
    "38 19 * * *",
    async()=>{

        try{

            await service.gerarOrdensPreventivas();

        }catch(error){

            log.error({ err: error }, "erro ao gerar preventivas");

        }

    },
    {
        timezone:"America/Sao_Paulo"
    }
);
import cron from "node-cron";

import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";

import { ManutencaoPreventivaService } from "../services/ManutencaoPreventivaService";
import { NotificacaoSistemaService } from "../services/notificacaoSistemaService";

import { NotificacaoService } from "../services/NotificacaoService";
import { PushNotificationService } from "../services/PushNotificationService";


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


console.log(
    "🚀 Job de manutenção preventiva carregado"
);


cron.schedule(
    "08 15 * * *",
    async()=>{

        console.log(
            "⏰ Executando cron preventiva:",
            new Date()
        );

        try{

            await service.gerarOrdensPreventivas();

            console.log(
                "✅ Ordens preventivas geradas!"
            );

        }catch(error){

            console.error(
                "❌ Erro ao gerar preventivas:",
                error
            );

        }

    },
    {
        timezone:"America/Sao_Paulo"
    }
);
import cron from "node-cron";

import { MaquinaRepository } 
from "../repositories/MaquinaRepository";

import { OrdemServicoRepository }
from "../repositories/OrdemServicoRepository";

import { ManutencaoPreventivaService }
from "../services/ManutencaoPreventivaService";

import { NotificacaoService }
from "../services/NotificacaoService";

import { UsuarioRepository }
from "../repositories/UsuarioRepository";

import { PushNotificationService }
from "../services/PushNotificationService";


const maquinaRepository =
    new MaquinaRepository();


const ordemServicoRepository =
    new OrdemServicoRepository();

const notificacaoService =
    new NotificacaoService();

const usuarioRepository =
    new UsuarioRepository();

const pushNotificationService =
    new PushNotificationService();

const service =
    new ManutencaoPreventivaService(
        maquinaRepository,
        ordemServicoRepository,
        notificacaoService,
        usuarioRepository,
        pushNotificationService
    );

console.log(
    "Job de manutenção preventiva carregado"
);

cron.schedule(
     "55 17 * * *",
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
            timezone: "America/Sao_Paulo"
     }

);
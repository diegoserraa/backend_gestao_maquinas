import cron from "node-cron";

import { MaquinaRepository } 
from "../repositories/MaquinaRepository";

import { OrdemServicoRepository }
from "../repositories/OrdemServicoRepository";

import { ManutencaoPreventivaService }
from "../services/ManutencaoPreventivaService";


const maquinaRepository =
    new MaquinaRepository();


const ordemServicoRepository =
    new OrdemServicoRepository();



const service =
    new ManutencaoPreventivaService(
        maquinaRepository,
        ordemServicoRepository
    );

console.log(
    "Job de manutenção preventiva carregado"
);

cron.schedule(
    "55 22 * * *",
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

    }
);
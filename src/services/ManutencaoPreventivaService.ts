import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";


export class ManutencaoPreventivaService {

    constructor(
        private maquinaRepository: MaquinaRepository,
        private ordemServicoRepository: OrdemServicoRepository
    ){}


  async gerarOrdensPreventivas(){

    const amanha = new Date();

    amanha.setDate(
        amanha.getDate() + 1
    );


    const dataProxima =
        amanha.toISOString().split("T")[0];


    console.log(
        "📅 Buscando manutenção para:",
        dataProxima
    );


    const maquinas =
        await this.maquinaRepository
        .buscarPorDataProximaManutencao(
            dataProxima
        );


    console.log(
        "🔎 Máquinas encontradas:",
        maquinas.length, dataProxima
    );


    for(const maquina of maquinas){


        console.log(
            "⚙️ Processando máquina:",
            maquina.id,
            maquina.nome
        );


        const ordemExistente =
            await this.ordemServicoRepository
            .existePreventivaPendente(
                maquina.id
            );


        if(ordemExistente){

            console.log(
                "⚠️ Já possui preventiva:",
                maquina.id
            );

            continue;
        }



        const ordem =
        await this.ordemServicoRepository.criar({

            maquina_id: maquina.id,
            tipo_manutencao:"PREVENTIVA",
            prioridade:"MEDIA",
            status:"ABERTA",
            descricao:
            `Manutenção preventiva gerada automaticamente pelo sistema.`

        });


        console.log(
            "✅ OS criada:",
            ordem
        );

    }


}

}
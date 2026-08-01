import { DashboardRepository } from "../repositories/DashboardRepository";


export class DashboardService {


    private repository = new DashboardRepository();




    // =========================
    // GESTOR
    // =========================



    async obterKPIs(
        dataInicio?: string,
        dataFim?: string
    ) {

        return this.repository.obterKPIs(
            dataInicio,
            dataFim
        );

    }






    async obterEvolucaoOS(
        dataInicio?: string,
        dataFim?: string
    ) {


        return this.repository.obterEvolucaoOS(
            dataInicio,
            dataFim
        );


    }







 async obterTempoMedioResolucao(
    dataInicio?: string,
    dataFim?: string
) {
    return this.repository.obterTempoMedioResolucao(
        dataInicio,
        dataFim
    );
}







    async obterMaquinasMaisParadas(
        dataInicio?: string,
        dataFim?: string
    ) {


        return this.repository.obterMaquinasMaisParadas(
            dataInicio,
            dataFim
        );


    }







    async obterPreventivasVencidas(
        dataInicio?: string,
        dataFim?: string
    ) {


        return this.repository.obterPreventivasVencidas(
            dataInicio,
            dataFim
        );


    }







    async obterRankingTecnicos(
        dataInicio?: string,
        dataFim?: string
    ) {


        return this.repository.obterRankingTecnicos(
            dataInicio,
            dataFim
        );


    }







    async obterCustos(
        dataInicio?: string,
        dataFim?: string
    ) {


        return this.repository.obterCustos(
            dataInicio,
            dataFim
        );


    }







    async obterAlertas() {


        return this.repository.obterAlertas();


    }








    // =========================
    // TECNICO
    // =========================




    async obterDashboardTecnico(
        tecnicoId:number
    ) {


        const [
            total,
            abertas,
            andamento,
            finalizadas,
            historico

        ] = await Promise.all([


            this.repository.obterTotalOSTecnico(
                tecnicoId
            ),



            this.repository.obterOSTecnicoAbertas(
                tecnicoId
            ),



            this.repository.obterAndamentoTecnico(
                tecnicoId
            ),



            this.repository.obterFinalizadasTecnico(
                tecnicoId
            ),



            this.repository.obterHistoricoTecnico(
                tecnicoId
            )



        ]);




        return {

            total,
            abertas,
            andamento,
            finalizadas,
            historico

        };


    }









    async obterOSTecnicoAbertas(
        tecnicoId:number
    ) {


        return this.repository.obterOSTecnicoAbertas(
            tecnicoId
        );


    }







    async obterOSTecnicoAndamento(
        tecnicoId:number
    ) {


        return this.repository.obterAndamentoTecnico(
            tecnicoId
        );


    }







    async obterOSTecnicoFinalizadas(
        tecnicoId:number
    ) {


        return this.repository.obterFinalizadasTecnico(
            tecnicoId
        );


    }










    // =========================
    // OPERADOR
    // =========================






    async obterDashboardOperador(
        operadorId:number
    ) {



        const [
            abertas,
            finalizadas,
            historico

        ] = await Promise.all([


            this.repository.obterOSAbertasOperador(
                operadorId
            ),



            this.repository.obterOSFinalizadasOperador(
                operadorId
            ),



            this.repository.obterHistoricoOperador(
                operadorId
            )



        ]);





        return {

            abertas,
            finalizadas,
            historico

        };


    }








    async obterOSOperador(
        operadorId:number
    ) {


        return this.repository.obterHistoricoOperador(
            operadorId
        );


    }



}
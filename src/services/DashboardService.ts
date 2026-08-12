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




async obterDashboardTecnico(tecnicoId: number) {
    const [
        total,
        abertas,
        andamento,
        finalizadas
    ] = await Promise.all([
        this.repository.obterTotalOSTecnico(tecnicoId),
        this.repository.obterOSTecnicoAbertas(tecnicoId),
        this.repository.obterOSAndamentoTecnico(tecnicoId),
        this.repository.obterOSFinalizadasTecnico(tecnicoId)
    ]);

    return {
        total: Number(total.total),
        abertas: Number(abertas.total),
        andamento: Number(andamento.total),
        finalizadas: Number(finalizadas.total)
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


        return this.repository.obterOSAndamentoTecnico(
            tecnicoId
        );


    }







    async obterOSTecnicoFinalizadas(
        tecnicoId:number
    ) {


        return this.repository.obterOSFinalizadasTecnico(
            tecnicoId
        );


    }










    // =========================
    // OPERADOR
    // =========================






   async obterDashboardOperador(operadorId: number) {
    const [
        abertas,
        andamento,
        finalizadas
    ] = await Promise.all([
        this.repository.obterOSAbertasOperador(operadorId),
        this.repository.obterOSAndamentoOperador(operadorId),
        this.repository.obterOSFinalizadasOperador(operadorId)
    ]);

    return {
        abertas: Number(abertas.total),
        andamento: Number(andamento.total),
        finalizadas: Number(finalizadas.total)
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
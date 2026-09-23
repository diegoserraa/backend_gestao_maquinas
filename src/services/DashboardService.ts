import { DashboardRepository } from "../repositories/DashboardRepository";


export class DashboardService {


    private repository = new DashboardRepository();




    // =========================
    // GESTOR
    // =========================



    async obterKPIs(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {

        return this.repository.obterKPIs(
            dataInicio,
            dataFim,
            empresaId
        );

    }






    async obterEvolucaoOS(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {


        return this.repository.obterEvolucaoOS(
            dataInicio,
            dataFim,
            empresaId
        );


    }







 async obterTempoMedioResolucao(
    dataInicio: string | undefined,
    dataFim: string | undefined,
    empresaId: string
) {
    return this.repository.obterTempoMedioResolucao(
        dataInicio,
        dataFim,
        empresaId
    );
}







    async obterMaquinasMaisParadas(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {


        return this.repository.obterMaquinasMaisParadas(
            dataInicio,
            dataFim,
            empresaId
        );


    }







    async obterPreventivasVencidas(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {


        return this.repository.obterPreventivasVencidas(
            dataInicio,
            dataFim,
            empresaId
        );


    }







    async obterRankingTecnicos(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {


        return this.repository.obterRankingTecnicos(
            dataInicio,
            dataFim,
            empresaId
        );


    }







    async obterCustos(
        dataInicio: string | undefined,
        dataFim: string | undefined,
        empresaId: string
    ) {


        return this.repository.obterCustos(
            dataInicio,
            dataFim,
            empresaId
        );


    }







    async obterAlertas(empresaId: string) {


        return this.repository.obterAlertas(empresaId);


    }








    // =========================
    // TECNICO
    // =========================




async obterDashboardTecnico(tecnicoId: number, empresaId: string) {
    const [
        total,
        abertas,
        andamento,
        finalizadas
    ] = await Promise.all([
        this.repository.obterTotalOSTecnico(tecnicoId, empresaId),
        this.repository.obterOSTecnicoAbertas(tecnicoId, empresaId),
        this.repository.obterOSAndamentoTecnico(tecnicoId, empresaId),
        this.repository.obterOSFinalizadasTecnico(tecnicoId, empresaId)
    ]);

    return {
        total: Number(total.total),
        abertas: Number(abertas.total),
        andamento: Number(andamento.total),
        finalizadas: Number(finalizadas.total)
    };
}









    async obterOSTecnicoAbertas(
        tecnicoId:number,
        empresaId: string
    ) {


        return this.repository.obterOSTecnicoAbertas(
            tecnicoId,
            empresaId
        );


    }







    async obterOSTecnicoAndamento(
        tecnicoId:number,
        empresaId: string
    ) {


        return this.repository.obterOSAndamentoTecnico(
            tecnicoId,
            empresaId
        );


    }







    async obterOSTecnicoFinalizadas(
        tecnicoId:number,
        empresaId: string
    ) {


        return this.repository.obterOSFinalizadasTecnico(
            tecnicoId,
            empresaId
        );


    }









    // =========================
    // OPERADOR
    // =========================






   async obterDashboardOperador(operadorId: number, empresaId: string) {
    const [
        abertas,
        andamento,
        finalizadas
    ] = await Promise.all([
        this.repository.obterOSAbertasOperador(operadorId, empresaId),
        this.repository.obterOSAndamentoOperador(operadorId, empresaId),
        this.repository.obterOSFinalizadasOperador(operadorId, empresaId)
    ]);

    return {
        abertas: Number(abertas.total),
        andamento: Number(andamento.total),
        finalizadas: Number(finalizadas.total)
    };
}








    async obterOSOperador(
        operadorId:number,
        empresaId: string
    ) {


        return this.repository.obterHistoricoOperador(
            operadorId,
            empresaId
        );


    }



}

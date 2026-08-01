import { Request, Response } from "express";
import { DashboardService } from "../services/DashboardService";


export class DashboardController {

    private service = new DashboardService();



    // =========================
    // GESTOR
    // =========================


    kpis = async (
        req: Request,
        res: Response
    ) => {

        try {

            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterKPIs(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);


        } catch (error) {

            return res.status(500).json({
                erro: "Erro ao buscar KPIs",
                detalhes: error
            });

        }

    };




    evolucao = async (
        req: Request,
        res: Response
    ) => {

        try {

            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterEvolucaoOS(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);


        } catch (error) {

            return res.status(500).json({
                erro: "Erro ao buscar evolução",
                detalhes: error
            });

        }

    };





    obterTempoMedioResolucao = async (
        req: Request,
        res: Response
    ) => {

        try {
            const { dataInicio, dataFim } = req.query;
            const dados =
                await this.service.obterTempoMedioResolucao(
                    dataInicio as string,
                    dataFim as string);


            return res.json(dados);


        } catch (error) {

            return res.status(500).json({
                erro: "Erro ao buscar disponibilidade",
                detalhes: error
            });

        }

    };






    maquinasParadas = async (
        req: Request,
        res: Response
    ) => {

        try {


            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterMaquinasMaisParadas(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);



        } catch (error) {


            return res.status(500).json({
                erro: "Erro ao buscar máquinas paradas",
                detalhes: error
            });


        }

    };







    tiposManutencao = async (
        req: Request,
        res: Response
    ) => {


        try {


            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterTiposManutencao(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar tipos de manutenção",
                detalhes:error
            });


        }

    };








    rankingTecnicos = async (
        req: Request,
        res: Response
    ) => {


        try {


            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterRankingTecnicos(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar ranking",
                detalhes:error
            });


        }

    };








    custos = async (
        req: Request,
        res: Response
    ) => {


        try {


            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterCustos(
                    dataInicio as string,
                    dataFim as string
                );


            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar custos",
                detalhes:error
            });


        }

    };








    alertas = async (
        req: Request,
        res: Response
    ) => {


        try {


            const dados =
                await this.service.obterAlertas();



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar alertas",
                detalhes:error
            });


        }

    };







    // =========================
    // TECNICO
    // =========================



    resumoTecnico = async (
        req: Request,
        res: Response
    ) => {


        try {


            const tecnicoId =
                Number(req.params.id);



            const dados =
                await this.service.obterDashboardTecnico(
                    tecnicoId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro no dashboard técnico",
                detalhes:error
            });


        }

    };









    osAbertasTecnico = async (
        req: Request,
        res: Response
    ) => {


        try {


            const tecnicoId =
                Number(req.params.id);



            const dados =
                await this.service.obterOSTecnicoAbertas(
                    tecnicoId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar OS abertas",
                detalhes:error
            });


        }

    };









    osAndamentoTecnico = async (
        req: Request,
        res: Response
    ) => {


        try {


            const tecnicoId =
                Number(req.params.id);



            const dados =
                await this.service.obterOSTecnicoAndamento(
                    tecnicoId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar OS andamento",
                detalhes:error
            });


        }

    };









    osFinalizadasTecnico = async (
        req: Request,
        res: Response
    ) => {


        try {


            const tecnicoId =
                Number(req.params.id);



            const dados =
                await this.service.obterOSTecnicoFinalizadas(
                    tecnicoId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar OS finalizadas",
                detalhes:error
            });


        }

    };










    // =========================
    // OPERADOR
    // =========================




    resumoOperador = async (
        req: Request,
        res: Response
    ) => {


        try {


            const operadorId =
                Number(req.params.id);



            const dados =
                await this.service.obterDashboardOperador(
                    operadorId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro no dashboard operador",
                detalhes:error
            });


        }

    };








    minhasOsOperador = async (
        req: Request,
        res: Response
    ) => {


        try {


            const operadorId =
                Number(req.params.id);



            const dados =
                await this.service.obterOSOperador(
                    operadorId
                );



            return res.json(dados);



        } catch(error) {


            return res.status(500).json({
                erro:"Erro ao buscar minhas OS",
                detalhes:error
            });


        }

    };

}
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
                    dataFim as string,
                    req.empresaId!
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
                    dataFim as string,
                    req.empresaId!
                );


            return res.json(dados);


        } catch (error) {

            return res.status(500).json({
                erro: "Erro ao buscar evolução",
                detalhes: error
            });

        }

    };





    tempoMedioResolucao = async (
        req: Request,
        res: Response
    ) => {

        try {
            const { dataInicio, dataFim } = req.query;
            const dados =
                await this.service.obterTempoMedioResolucao(
                    dataInicio as string,
                    dataFim as string,
                    req.empresaId!
                );


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
                    dataFim as string,
                    req.empresaId!
                );


            return res.json(dados);



        } catch (error) {


            return res.status(500).json({
                erro: "Erro ao buscar máquinas paradas",
                detalhes: error
            });


        }

    };







    preventivasVencidas = async (
        req: Request,
        res: Response
    ) => {


        try {


            const { dataInicio, dataFim } = req.query;


            const dados =
                await this.service.obterPreventivasVencidas(
                    dataInicio as string,
                    dataFim as string,
                    req.empresaId!
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
                    dataFim as string,
                    req.empresaId!
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
                    dataFim as string,
                    req.empresaId!
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
                await this.service.obterAlertas(req.empresaId!);



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

            // sempre o próprio usuário logado — nunca o :id da URL, senão
            // qualquer um veria o dashboard de outro técnico só trocando o id
            const dados =
                await this.service.obterDashboardTecnico(
                    req.user!.id,
                    req.empresaId!
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

            const dados =
                await this.service.obterOSTecnicoAbertas(
                    req.user!.id,
                    req.empresaId!
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

            const dados =
                await this.service.obterOSTecnicoAndamento(
                    req.user!.id,
                    req.empresaId!
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

            const dados =
                await this.service.obterOSTecnicoFinalizadas(
                    req.user!.id,
                    req.empresaId!
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

            const dados =
                await this.service.obterDashboardOperador(
                    req.user!.id,
                    req.empresaId!
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

            const dados =
                await this.service.obterOSOperador(
                    req.user!.id,
                    req.empresaId!
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

import { Request, Response } from "express";
import { RelatorioService } from "../services/RelatorioService";

export class RelatorioController {

  private service = new RelatorioService();

  /* =====================================================
     HISTÓRICO DE OS
  ===================================================== */

  ExportarHistoricoOS = async (
    req: Request,
    res: Response
  ) => {

    const {
      dataInicial,
      dataFinal,
      setorId,
      maquinaId,
      status,
      tipoManutencao,
      apenasParada,
    } = req.query;

    const filtros = {

      empresaId: req.empresaId!,

      dataInicial: dataInicial
        ? String(dataInicial)
        : undefined,

      dataFinal: dataFinal
        ? String(dataFinal)
        : undefined,

      setorId:
        setorId !== undefined && setorId !== null
          ? Number(setorId)
          : undefined,

      maquinaId:
        maquinaId !== undefined && maquinaId !== null
          ? Number(maquinaId)
          : undefined,

      status: status
        ? String(status)
        : undefined,

      tipoManutencao: tipoManutencao
        ? String(tipoManutencao)
        : undefined,

      apenasParada: apenasParada === "true",
    };

    const arquivo =
      await this.service.ExportarHistoricoOS(
        filtros
      );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="historico-ordens-servico.xlsx"'
    );

    return res.send(arquivo);
  };


  /* =====================================================
     INDICADORES POR MÁQUINA
  ===================================================== */

  ExportarIndicadoresMaquinas = async (
    req: Request,
    res: Response
  ) => {

    const {
      dataInicial,
      dataFinal,
      setorId,
      maquinaId,
    } = req.query;

    const filtros = {

      empresaId: req.empresaId!,

      dataInicial: dataInicial
        ? String(dataInicial)
        : undefined,

      dataFinal: dataFinal
        ? String(dataFinal)
        : undefined,

      setorId:
        setorId !== undefined && setorId !== null
          ? Number(setorId)
          : undefined,

      maquinaId:
        maquinaId !== undefined && maquinaId !== null
          ? Number(maquinaId)
          : undefined,
    };

    const arquivo =
      await this.service.ExportarIndicadoresMaquinas(
        filtros
      );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="indicadores-por-maquina.xlsx"'
    );

    return res.send(arquivo);
  };


  /* =====================================================
     PRODUTIVIDADE POR TÉCNICO
  ===================================================== */

  ExportarProdutividadeTecnico = async (
    req: Request,
    res: Response
  ) => {

    const { dataInicial, dataFinal } = req.query;

    const filtros = {
      empresaId: req.empresaId!,
      dataInicial: dataInicial ? String(dataInicial) : undefined,
      dataFinal: dataFinal ? String(dataFinal) : undefined,
    };

    const arquivo =
      await this.service.ExportarProdutividadeTecnico(filtros);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="produtividade-por-tecnico.xlsx"'
    );

    return res.send(arquivo);
  };

  previewProdutividadeTecnico = async (
    req: Request,
    res: Response
  ) => {

    const { dataInicial, dataFinal } = req.query;

    const filtros = {
      empresaId: req.empresaId!,
      dataInicial: dataInicial ? String(dataInicial) : undefined,
      dataFinal: dataFinal ? String(dataFinal) : undefined,
    };

    const dados =
      await this.service.previewProdutividadeTecnico(filtros);

    return res.json(dados);
  };


  /* =====================================================
     ALERTAS DE MONITORAMENTO
  ===================================================== */

  ExportarAlertasMonitoramento = async (
    req: Request,
    res: Response
  ) => {

    const { dataInicial, dataFinal, setorId, maquinaId } = req.query;

    const filtros = {
      empresaId: req.empresaId!,
      dataInicial: dataInicial ? String(dataInicial) : undefined,
      dataFinal: dataFinal ? String(dataFinal) : undefined,
      setorId: setorId !== undefined && setorId !== null ? Number(setorId) : undefined,
      maquinaId: maquinaId !== undefined && maquinaId !== null ? Number(maquinaId) : undefined,
    };

    const arquivo =
      await this.service.ExportarAlertasMonitoramento(filtros);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="alertas-de-monitoramento.xlsx"'
    );

    return res.send(arquivo);
  };

  previewAlertasMonitoramento = async (
    req: Request,
    res: Response
  ) => {

    const { dataInicial, dataFinal, setorId, maquinaId } = req.query;

    const filtros = {
      empresaId: req.empresaId!,
      dataInicial: dataInicial ? String(dataInicial) : undefined,
      dataFinal: dataFinal ? String(dataFinal) : undefined,
      setorId: setorId !== undefined && setorId !== null ? Number(setorId) : undefined,
      maquinaId: maquinaId !== undefined && maquinaId !== null ? Number(maquinaId) : undefined,
    };

    const dados =
      await this.service.previewAlertasMonitoramento(filtros);

    return res.json(dados);
  };


  /* =====================================================
     PREVIEW - HISTÓRICO DE OS
  ===================================================== */

  previewHistoricoOS = async (
    req: Request,
    res: Response
  ) => {

    const {
      dataInicial,
      dataFinal,
      setorId,
      maquinaId,
      status,
      tipoManutencao,
      apenasParada,
    } = req.query;

    const filtros = {

      empresaId: req.empresaId!,

      dataInicial: dataInicial
        ? String(dataInicial)
        : undefined,

      dataFinal: dataFinal
        ? String(dataFinal)
        : undefined,

      setorId:
        setorId !== undefined && setorId !== null
          ? Number(setorId)
          : undefined,

      maquinaId:
        maquinaId !== undefined && maquinaId !== null
          ? Number(maquinaId)
          : undefined,

      status: status
        ? String(status)
        : undefined,

      tipoManutencao: tipoManutencao
        ? String(tipoManutencao)
        : undefined,

      apenasParada: apenasParada === "true",
    };

    const dados =
      await this.service.previewHistoricoOS(
        filtros
      );

    return res.json(dados);
  };


  /* =====================================================
     PREVIEW - INDICADORES POR MÁQUINA
  ===================================================== */

  previewIndicadoresMaquinas = async (
    req: Request,
    res: Response
  ) => {

    const {
      dataInicial,
      dataFinal,
      setorId,
      maquinaId,
    } = req.query;

    const filtros = {

      empresaId: req.empresaId!,

      dataInicial: dataInicial
        ? String(dataInicial)
        : undefined,

      dataFinal: dataFinal
        ? String(dataFinal)
        : undefined,

      setorId:
        setorId !== undefined && setorId !== null
          ? Number(setorId)
          : undefined,

      maquinaId:
        maquinaId !== undefined && maquinaId !== null
          ? Number(maquinaId)
          : undefined,
    };

    const dados =
      await this.service.previewIndicadoresMaquinas(
        filtros
      );

    return res.json(dados);
  };
}
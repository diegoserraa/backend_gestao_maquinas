import ExcelJS from "exceljs";

import {
  FiltrosRelatorioOS,
  FiltrosRelatorioMaquina,
} from "../interfaces/Irelatorio";

import {
  RelatorioRepository
} from "../repositories/RelatorioRepository";


export class RelatorioService {

  private repository = new RelatorioRepository();


  /* =====================================================
     RELATÓRIO HISTÓRICO DE OS
  ===================================================== */

  async ExportarHistoricoOS(
    filtros: FiltrosRelatorioOS
  ): Promise<ExcelJS.Buffer> {

    const dados =
      await this.repository.historicoOrdensServico(
        filtros
      );


    const workbook =
      new ExcelJS.Workbook();


    workbook.creator =
      "Sistema de Manutenção";

    workbook.created =
      new Date();


    const worksheet =
      workbook.addWorksheet(
        "Histórico de OS"
      );


    /* =========================
       TÍTULO
    ========================= */

    worksheet.mergeCells("A1:Q1");


    const titulo =
      worksheet.getCell("A1");


    titulo.value =
      "Histórico de Ordens de Serviço";


    titulo.font = {
      bold: true,
      size: 16,
    };


    titulo.alignment = {
      horizontal: "center",
      vertical: "middle",
    };


    worksheet.getRow(1).height =
      28;


    /* =========================
       COLUNAS
    ========================= */

    worksheet.columns = [

      {
        key: "id",
        width: 10,
      },

      {
        key: "maquina_nome",
        width: 24,
      },

      {
        key: "setor_nome",
        width: 20,
      },

      {
        key: "descricao",
        width: 35,
      },

      {
        key: "status",
        width: 18,
      },

      {
        key: "tipo_manutencao",
        width: 18,
      },

      {
        key: "prioridade",
        width: 15,
      },

      {
        key: "tecnico_nome",
        width: 24,
      },

      {
        key: "solicitante_nome",
        width: 24,
      },

      {
        key: "data_abertura",
        width: 20,
      },

      {
        key: "data_atribuicao",
        width: 20,
      },

      {
        key: "data_inicio_atendimento",
        width: 22,
      },

      {
        key: "data_resolucao",
        width: 20,
      },

      {
        key: "resolucao",
        width: 35,
      },

      {
        key: "motivo_cancelamento",
        width: 30,
      },

      {
        key: "valor_gasto",
        width: 16,
      },

      {
        key: "valor_parceiro",
        width: 16,
      },
    ];


    /* =========================
       CABEÇALHO
    ========================= */

    const headerRow =
      worksheet.getRow(2);


    headerRow.values = [

      "Número da OS",

      "Máquina",

      "Setor",

      "Descrição do Problema",

      "Status",

      "Tipo de Manutenção",

      "Prioridade",

      "Técnico Responsável",

      "Solicitante",

      "Data de Abertura",

      "Data de Atribuição",

      "Início do Atendimento",

      "Data de Finalização",

      "Descrição da Solução",

      "Motivo do Cancelamento",

      "Custo da Manutenção",

      "Custo do Parceiro",
    ];


    headerRow.font = {
      bold: true,
    };


    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };


    headerRow.height = 24;


    headerRow.eachCell((cell) => {

      cell.border = {

        top: {
          style: "thin",
        },

        bottom: {
          style: "thin",
        },

        left: {
          style: "thin",
        },

        right: {
          style: "thin",
        },
      };

    });


    /* =========================
       DADOS
    ========================= */

    dados.forEach((item) => {

      const row =
        worksheet.addRow({

          id:
            item.id,

          maquina_nome:
            item.maquina_nome,

          setor_nome:
            item.setor_nome ?? "-",

          descricao:
            item.descricao ?? "-",

          status:
            item.status,

          tipo_manutencao:
            item.tipo_manutencao ?? "-",

          prioridade:
            item.prioridade ?? "-",

          tecnico_nome:
            item.tecnico_nome ?? "-",

          solicitante_nome:
            item.solicitante_nome ?? "-",


          data_abertura:
            item.data_abertura
              ? this.formatarDataHora(item.data_abertura)
              : null,

          data_atribuicao:
            item.data_atribuicao
              ? this.formatarDataHora(item.data_atribuicao)
              : null,

          data_inicio_atendimento:
            item.data_inicio_atendimento
              ? this.formatarDataHora(item.data_inicio_atendimento)
              : null,

          data_resolucao:
            item.data_resolucao
              ? this.formatarDataHora(item.data_resolucao)
              : null,

          resolucao:
            item.resolucao ?? "-",


          motivo_cancelamento:
            item.motivo_cancelamento ?? "-",


          valor_gasto:
            item.valor_gasto ?? 0,


          valor_parceiro:
            item.valor_parceiro ?? 0,

        });

      row.getCell(
        "valor_gasto"
      ).numFmt =
        "R$ #,##0.00";


      row.getCell(
        "valor_parceiro"
      ).numFmt =
        "R$ #,##0.00";


      row.alignment = {
        vertical: "top",
      };


      row.eachCell((cell) => {

        cell.border = {

          bottom: {
            style: "hair",
          },

        };

      });

    });


    /* =========================
       FILTRO DO EXCEL
    ========================= */

    worksheet.autoFilter = {

      from: "A2",

      to: "Q2",

    };


    worksheet.views = [

      {
        state: "frozen",
        ySplit: 2,
      },

    ];


    return workbook.xlsx.writeBuffer();
  }


  /* =====================================================
     RELATÓRIO DE INDICADORES
  ===================================================== */

  async ExportarIndicadoresMaquinas(
    filtros: FiltrosRelatorioMaquina
  ): Promise<ExcelJS.Buffer> {

    const dados =
      await this.repository.indicadoresPorMaquina(
        filtros
      );


    const workbook =
      new ExcelJS.Workbook();


    workbook.creator =
      "Sistema de Manutenção";

    workbook.created =
      new Date();


    const worksheet =
      workbook.addWorksheet(
        "Indicadores"
      );


    /* =====================================================
       TÍTULO
    ===================================================== */

    worksheet.mergeCells("A1:O1");


    const titulo =
      worksheet.getCell("A1");


    titulo.value =
      "Indicadores de Manutenção por Máquina";


    titulo.font = {
      bold: true,
      size: 16,
    };


    titulo.alignment = {
      horizontal: "center",
      vertical: "middle",
    };


    worksheet.getRow(1).height =
      28;


    /* =====================================================
       COLUNAS
    ===================================================== */

    worksheet.columns = [

      {
        key: "maquina_nome",
        width: 25,
      },

      {
        key: "setor_nome",
        width: 22,
      },

      {
        key: "total_os",
        width: 14,
      },

      {
        key: "os_abertas",
        width: 15,
      },

      {
        key: "os_atribuidas",
        width: 17,
      },

      {
        key: "os_em_andamento",
        width: 20,
      },

      {
        key: "os_canceladas",
        width: 18,
      },

      {
        key: "os_finalizadas",
        width: 18,
      },

      {
        key: "mttr",
        width: 28,
      },

      {
        key: "mtbf",
        width: 28,
      },

      {
        key: "tempo_atendimento",
        width: 30,
      },

      {
        key: "corretivas",
        width: 22,
      },

      {
        key: "preventivas",
        width: 22,
      },

      {
        key: "ultima_os_abertura",
        width: 24,
      },

      {
        key: "ultima_manutencao",
        width: 24,
      },

    ];


    /* =====================================================
       CABEÇALHO
    ===================================================== */

    const headerRow =
      worksheet.getRow(2);


    headerRow.values = [

      "Máquina",

      "Setor",

      "Total de OS",

      "OS Abertas",

      "OS Atribuídas",

      "OS em Andamento",

      "OS Canceladas",

      "OS Finalizadas",

      "Tempo Médio para Reparo (MTTR)",

      "Tempo Médio entre Falhas (MTBF)",

      "Tempo Médio até o Atendimento",

      "Manutenções Corretivas",

      "Manutenções Preventivas",

      "Última OS Aberta",

      "Última Manutenção",

    ];


    headerRow.font = {
      bold: true,
    };


    headerRow.alignment = {

      horizontal: "center",

      vertical: "middle",

      wrapText: true,

    };


    headerRow.height =
      42;


    /* =====================================================
       FORMATAR TEMPO
    ===================================================== */

    const formatarTempo = (
      segundos: number | null
    ): string => {

      if (segundos == null) {

        return "—";

      }


      if (segundos < 60) {

        return `${Math.round(segundos)}s`;

      }


      if (segundos < 3600) {

        const minutos =
          Math.floor(
            segundos / 60
          );

        return `${minutos}min`;

      }


      if (segundos < 86400) {

        const horas =
          Math.floor(
            segundos / 3600
          );


        const minutos =
          Math.floor(
            (segundos % 3600) / 60
          );


        return `${horas}h ${minutos}min`;

      }


      const dias =
        (segundos / 86400)
          .toFixed(1);


      return `${dias}d`;
    };


    /* =====================================================
       DADOS
    ===================================================== */

    dados.forEach((item) => {

      const row =
        worksheet.addRow({

          maquina_nome:
            item.maquina_nome,

          setor_nome:
            item.setor_nome ?? "-",


          total_os:
            Number(item.total_os),


          os_abertas:
            Number(item.os_abertas),


          os_atribuidas:
            Number(item.os_atribuidas),


          os_em_andamento:
            Number(item.os_em_andamento),


          os_canceladas:
            Number(item.os_canceladas),


          os_finalizadas:
            Number(item.os_finalizadas),


          mttr:
            formatarTempo(
              item.mttr_segundos !== null
                ? Number(
                  item.mttr_segundos
                )
                : null
            ),


          mtbf:
            formatarTempo(
              item.mtbf_segundos !== null
                ? Number(
                  item.mtbf_segundos
                )
                : null
            ),


          tempo_atendimento:
            formatarTempo(
              item.tempo_atendimento_segundos !== null
                ? Number(
                  item.tempo_atendimento_segundos
                )
                : null
            ),


          corretivas:
            Number(item.corretivas),


          preventivas:
            Number(item.preventivas),


          ultima_os_abertura:
            item.ultima_os_abertura
            ? this.formatarDataHora(item.ultima_os_abertura)
            : null,

          ultima_manutencao:
            item.ultima_manutencao
            ? this.formatarDataHora(item.ultima_manutencao)
            : null,
        });


      row.alignment = {
        vertical: "middle",
      };

    });


    /* =====================================================
       FILTRO
    ===================================================== */

    worksheet.autoFilter = {

      from: "A2",

      to: "O2",

    };


    /* =====================================================
       CONGELAR CABEÇALHO
    ===================================================== */

    worksheet.views = [

      {
        state: "frozen",
        ySplit: 2,
      },

    ];


    return workbook.xlsx.writeBuffer();
  }


  /* =====================================================
     PREVIEW INDICADORES
  ===================================================== */

  async previewIndicadoresMaquinas(
    filtros: FiltrosRelatorioMaquina
  ) {

    return this.repository.indicadoresPorMaquina(
      filtros
    );

  }


  /* =====================================================
     PREVIEW HISTÓRICO
  ===================================================== */

  async previewHistoricoOS(
    filtros: FiltrosRelatorioOS
  ) {

    return this.repository.historicoOrdensServico(
      filtros
    );

  }

  private formatarDataHora(
    data: Date | string | null | undefined
  ): string {

    if (!data) {
      return "-";
    }

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(new Date(data));

  }

}
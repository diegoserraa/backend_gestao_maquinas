import { pool } from "../database/connection";

import {
  FiltrosRelatorioOS,
  FiltrosRelatorioMaquina,
  RelatorioOS,
  RelatorioIndicadorMaquina,
} from "../interfaces/Irelatorio";


export class RelatorioRepository {


  /* =====================================================
     RELATÓRIO 1
     HISTÓRICO DE ORDENS DE SERVIÇO
  ===================================================== */

  async historicoOrdensServico(
    filtros: FiltrosRelatorioOS
  ): Promise<RelatorioOS[]> {

    const params: any[] = [filtros.empresaId];

    const conditions: string[] = [`os.empresa_id = $1`];

    let paramIndex = 2;


    /* =========================
       DATA INICIAL
    ========================= */

    if (filtros.dataInicial) {

      conditions.push(`
        os.data_abertura >= $${paramIndex}::date
      `);

      params.push(
        filtros.dataInicial
      );

      paramIndex++;

    }


    /* =========================
       DATA FINAL
    ========================= */

    if (filtros.dataFinal) {

      conditions.push(`
        os.data_abertura < (
          $${paramIndex}::date
          + INTERVAL '1 day'
        )
      `);

      params.push(
        filtros.dataFinal
      );

      paramIndex++;

    }


    /* =========================
       SETOR
    ========================= */

    if (
      filtros.setorId !== undefined &&
      filtros.setorId !== null
    ) {

      conditions.push(`
        m.setor_id = $${paramIndex}
      `);

      params.push(
        filtros.setorId
      );

      paramIndex++;

    }


    /* =========================
       MÁQUINA
    ========================= */

    if (
      filtros.maquinaId !== undefined &&
      filtros.maquinaId !== null
    ) {

      conditions.push(`
        os.maquina_id = $${paramIndex}
      `);

      params.push(
        filtros.maquinaId
      );

      paramIndex++;

    }


    /* =========================
       STATUS
    ========================= */

    if (filtros.status) {

      conditions.push(`
        os.status = $${paramIndex}
      `);

      params.push(
        filtros.status
      );

      paramIndex++;

    }


    /* =========================
       TIPO DE MANUTENÇÃO
    ========================= */

    if (filtros.tipoManutencao) {

      conditions.push(`
        os.tipo_manutencao = $${paramIndex}
      `);

      params.push(
        filtros.tipoManutencao
      );

      paramIndex++;

    }


    /* =========================
       WHERE
    ========================= */

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";


    /* =========================
       CONSULTA
    ========================= */

    const { rows } =
      await pool.query(

        `

        SELECT

          os.id,

          m.nome AS maquina_nome,

          s.nome AS setor_nome,

          os.descricao,

          os.status,

          os.tipo_manutencao,

          os.prioridade,

          CASE
            WHEN os.execucao_externa THEN
              'Externo' || COALESCE(' - ' || parceiro.nome, '')
            ELSE tecnico.nome
          END AS tecnico_nome,

          solicitante.nome AS solicitante_nome,

          os.data_abertura,

          os.data_atribuicao,

          os.data_inicio_atendimento,

          os.data_resolucao,

          os.resolucao,

          os.motivo_cancelamento,

          os.valor_gasto,

          os.id_parceiro,

          os.valor_parceiro


        FROM ordens_servico os


        INNER JOIN maquinas m
          ON m.id = os.maquina_id


        LEFT JOIN setores s
          ON s.id = m.setor_id


        LEFT JOIN usuarios tecnico
          ON tecnico.id = os.id_tecnico


        LEFT JOIN parceiros parceiro
          ON parceiro.id = os.id_parceiro
         AND parceiro.empresa_id = os.empresa_id


        LEFT JOIN usuarios solicitante
          ON solicitante.id = os.id_solicitante


        ${where}


        ORDER BY
          os.data_abertura DESC

        `,

        params

      );


    return rows;

  }


  /* =====================================================
     RELATÓRIO 2
     INDICADORES POR MÁQUINA
  ===================================================== */

  async indicadoresPorMaquina(
    filtros: FiltrosRelatorioMaquina
  ): Promise<RelatorioIndicadorMaquina[]> {

    const params: any[] = [filtros.empresaId];

    const conditions: string[] = [`m.empresa_id = $1`];

    let paramIndex = 2;


    /* =====================================================
       DATA INICIAL
    ===================================================== */

    if (filtros.dataInicial) {

      conditions.push(`
        os.data_abertura >= $${paramIndex}::date
      `);

      params.push(
        filtros.dataInicial
      );

      paramIndex++;

    }


    /* =====================================================
       DATA FINAL
    ===================================================== */

    if (filtros.dataFinal) {

      conditions.push(`
        os.data_abertura < (
          $${paramIndex}::date
          + INTERVAL '1 day'
        )
      `);

      params.push(
        filtros.dataFinal
      );

      paramIndex++;

    }


    /* =====================================================
       SETOR
    ===================================================== */

    if (
      filtros.setorId !== undefined &&
      filtros.setorId !== null
    ) {

      conditions.push(`
        m.setor_id = $${paramIndex}
      `);

      params.push(
        filtros.setorId
      );

      paramIndex++;

    }


    /* =====================================================
       MÁQUINA
    ===================================================== */

    if (
      filtros.maquinaId !== undefined &&
      filtros.maquinaId !== null
    ) {

      conditions.push(`
        m.id = $${paramIndex}
      `);

      params.push(
        filtros.maquinaId
      );

      paramIndex++;

    }


    /* =====================================================
       WHERE DOS FILTROS
       (conditions sempre tem ao menos o filtro de empresa)
    ===================================================== */

    const where =
      `WHERE ${conditions.join(" AND ")}`;


    /* =====================================================
       SOMENTE MÁQUINAS
       QUE POSSUEM OS FILTRADAS
       (só quando o usuário aplicou algum filtro além da
       empresa — senão continua mostrando toda máquina, com
       ou sem OS, como antes)
    ===================================================== */

    const somenteComOS =
      conditions.length > 1
        ? `WHERE m.empresa_id = $1 AND os.id IS NOT NULL`
        : `WHERE m.empresa_id = $1`;


    /* =====================================================
       CONSULTA
    ===================================================== */

    const { rows } =
      await pool.query(

        `

        WITH os_filtradas AS (

          SELECT
            os.*

          FROM ordens_servico os

          INNER JOIN maquinas m
            ON m.id = os.maquina_id

          ${where}

        ),


        /* =================================================
           INDICADORES
        ================================================= */

        indicadores AS (

          SELECT

            m.id AS maquina_id,

            m.nome AS maquina_nome,

            s.nome AS setor_nome,


            /* =========================
               TOTAL DE OS
            ========================= */

            COUNT(os.id) AS total_os,


            /* =========================
               OS ABERTAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.status = 'ABERTA'
            ) AS os_abertas,


            /* =========================
               OS ATRIBUÍDAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.status = 'ATRIBUIDA'
            ) AS os_atribuidas,


            /* =========================
               OS EM ANDAMENTO
            ========================= */

            COUNT(*) FILTER (
              WHERE os.status = 'EM_ANDAMENTO'
            ) AS os_em_andamento,


            /* =========================
               OS FINALIZADAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.status = 'FINALIZADA'
            ) AS os_finalizadas,


            /* =========================
               OS CANCELADAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.status = 'CANCELADA'
            ) AS os_canceladas,


            /* =========================
               CORRETIVAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.tipo_manutencao = 'CORRETIVA'
            ) AS corretivas,


            /* =========================
               PREVENTIVAS
            ========================= */

            COUNT(*) FILTER (
              WHERE os.tipo_manutencao = 'PREVENTIVA'
            ) AS preventivas,


            /* =========================
               MTTR
            ========================= */

           AVG(
  EXTRACT(
    EPOCH FROM (
      os.data_resolucao
      -
      os.data_inicio_atendimento
    )
  )
) FILTER (

              WHERE

                os.status = 'FINALIZADA'

                AND os.tipo_manutencao = 'CORRETIVA'

                AND os.data_abertura IS NOT NULL

                AND os.data_resolucao IS NOT NULL

            ) AS mttr_segundos,


            /* =========================
               TEMPO MÉDIO ATENDIMENTO
            ========================= */

            AVG(
              EXTRACT(
                EPOCH FROM (
                  os.data_inicio_atendimento
                  -
                  os.data_abertura
                )
              )
            ) FILTER (

              WHERE

                os.data_inicio_atendimento IS NOT NULL

                AND os.data_abertura IS NOT NULL

            ) AS tempo_atendimento_segundos,


            /* =========================
               ÚLTIMA OS
            ========================= */

            MAX(
              os.data_abertura
            ) AS ultima_os_abertura,


            /* =========================
               ÚLTIMA MANUTENÇÃO
            ========================= */

            MAX(
              os.data_resolucao
            ) FILTER (

              WHERE
                os.status = 'FINALIZADA'

            ) AS ultima_manutencao


          FROM maquinas m


          LEFT JOIN setores s
            ON s.id = m.setor_id


          LEFT JOIN os_filtradas os
            ON os.maquina_id = m.id


          ${somenteComOS}


          GROUP BY

            m.id,

            m.nome,

            s.nome

        ),


        /* =================================================
           MTBF
        ================================================= */

        falhas AS (

          SELECT

            maquina_id,

            AVG(intervalo) AS mtbf_segundos


          FROM (

            SELECT

              maquina_id,

              EXTRACT(
                EPOCH FROM (
                  data_abertura
                  -
                  LAG(data_resolucao) OVER (

                    PARTITION BY maquina_id

                    ORDER BY data_abertura

                  )
                )
              ) AS intervalo


            FROM os_filtradas


            WHERE

              tipo_manutencao = 'CORRETIVA'

              AND status = 'FINALIZADA'

              AND data_abertura IS NOT NULL

              AND data_resolucao IS NOT NULL

          ) intervalos


          WHERE

            intervalo IS NOT NULL

            AND intervalo >= 0


          GROUP BY
            maquina_id

        )


        /* =================================================
           RESULTADO FINAL
        ================================================= */

        SELECT

          i.maquina_id,

          i.maquina_nome,

          i.setor_nome,


          /* =========================
             QUANTIDADE DE OS
          ========================= */

          i.total_os,

          i.os_abertas,

          i.os_atribuidas,

          i.os_em_andamento,

          i.os_finalizadas,

          i.os_canceladas,


          /* =========================
             INDICADORES
          ========================= */

          i.mttr_segundos,

          f.mtbf_segundos,

          i.tempo_atendimento_segundos,


          /* =========================
             TIPOS
          ========================= */

          i.corretivas,

          i.preventivas,


          /* =========================
             DATAS
          ========================= */

          i.ultima_os_abertura,

          i.ultima_manutencao


        FROM indicadores i


        LEFT JOIN falhas f
          ON f.maquina_id = i.maquina_id


        ORDER BY
          i.maquina_nome

        `,

        params

      );


    return rows;

  }

}
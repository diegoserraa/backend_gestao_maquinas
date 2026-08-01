import { pool } from "../database/connection";


export class DashboardRepository {



    private montarFiltroPeriodo(
        dataInicio?: string,
        dataFim?: string,
        campo = "os.data_abertura"
    ) {


        const filtros:string[] = [];
        const valores:any[] = [];



        if(dataInicio){

            valores.push(dataInicio);

            filtros.push(
                `${campo} >= $${valores.length}`
            );

        }



        if(dataFim){

            valores.push(dataFim);

            filtros.push(
                `${campo} <= $${valores.length}`
            );

        }



        return {

            where:
                filtros.length
                    ? `AND ${filtros.join(" AND ")}`
                    : "",

            valores

        };


    }







    // =========================
    // KPIs
    // =========================



    async obterKPIs(
        dataInicio?:string,
        dataFim?:string
    ){



        const filtro =
            this.montarFiltroPeriodo(
                dataInicio,
                dataFim
            );



        const {rows} =
            await pool.query(`


            SELECT

            COUNT(*) FILTER(
                WHERE os.status='ABERTA'
            ) AS os_abertas,


            COUNT(*) FILTER(
                WHERE os.status='EM_ANDAMENTO'
            ) AS os_andamento,


            COUNT(*) FILTER(
                WHERE os.prioridade='CRITICA'
                AND os.status NOT IN(
                    'FINALIZADA',
                    'CANCELADA'
                )
            ) AS os_criticas,


            COUNT(*) FILTER(
                WHERE os.status='FINALIZADA'
            ) AS os_finalizadas,


            COUNT(*) FILTER(
                WHERE os.tipo_manutencao='PREVENTIVA'
            ) AS preventivas,

             COUNT(*) FILTER(
                WHERE os.tipo_manutencao='CORRETIVA'
            ) AS corretivas


            FROM ordens_servico os

            WHERE 1=1

            ${filtro.where}


            `,
            filtro.valores
        );



        return rows[0];


    }








    // =========================
    // EVOLUÇÃO
    // =========================



    async obterEvolucaoOS(
        dataInicio?:string,
        dataFim?:string
    ){



        const filtro =
            this.montarFiltroPeriodo(
                dataInicio,
                dataFim
            );



        const {rows} =
            await pool.query(`


            SELECT

            DATE(os.data_abertura) AS dia,

            COUNT(*) AS total


            FROM ordens_servico os


            WHERE 1=1

            ${filtro.where}


            GROUP BY DATE(os.data_abertura)

            ORDER BY dia



            `,
            filtro.valores
        );



        return rows;

    }








    // =========================
    // DISPONIBILIDADE
    // =========================



    // =========================
// DISPONIBILIDADE
// =========================

async obterTempoMedioResolucao(
  dataInicio?: string,
  dataFim?: string
) {
  const filtro = this.montarFiltroPeriodo(
    dataInicio,
    dataFim,
    "os.data_abertura"
  );

  const { rows } = await pool.query(
    `
    SELECT
      DATE(os.data_resolucao) AS dia,

      AVG(
        EXTRACT(
          EPOCH FROM (
            os.data_resolucao - os.data_abertura
          )
        )
      ) AS segundos

    FROM ordens_servico os

    WHERE
      os.status = 'FINALIZADA'
      AND os.data_resolucao IS NOT NULL

      ${filtro.where}

    GROUP BY DATE(os.data_resolucao)

    ORDER BY dia
    `,
    filtro.valores
  );


  const evolucao = rows.map((row) => {
    const segundos = Math.round(Number(row.segundos) || 0);

    return {
      dia: row.dia,
      segundos,
      horas: Number((segundos / 3600).toFixed(2)),
      formatado: this.formatarTempo(segundos)
    };
  });


  const totalSegundos = Math.round(
    evolucao.reduce(
      (total, item) => total + item.segundos,
      0
    ) / (evolucao.length || 1)
  );


  return {
    resumo: {
      segundos: totalSegundos,
      formatado: this.formatarTempo(totalSegundos)
    },

    evolucao
  };
}


private formatarTempo(segundos: number) {

  const horas = Math.floor(segundos / 3600);

  const minutos = Math.floor(
    (segundos % 3600) / 60
  );


  if (horas > 0 && minutos > 0) {
    return `${horas}h ${minutos}min`;
  }


  if (horas > 0) {
    return `${horas}h`;
  }


  return `${minutos}min`;
}





    // =========================
    // MÁQUINAS PARADAS
    // =========================



    async obterMaquinasMaisParadas(
        dataInicio?:string,
        dataFim?:string
    ){


        const filtro =
            this.montarFiltroPeriodo(
                dataInicio,
                dataFim
            );



        const {rows} =
            await pool.query(`


            SELECT

            m.id,
            m.nome,
            COUNT(os.id) total


            FROM maquinas m


            INNER JOIN ordens_servico os

            ON os.maquina_id=m.id



            WHERE 1=1

            ${filtro.where}



            GROUP BY
            m.id,
            m.nome



            ORDER BY total DESC


            LIMIT 10


            `,
            filtro.valores
        );



        return rows;


    }








async obterPreventivasVencidas(
    dataInicio?: string,
    dataFim?: string
) {

    const filtro =
        this.montarFiltroPeriodo(
            dataInicio,
            dataFim
        );

    const wherePeriodo =
        filtro.where.replaceAll(
            "os.data_abertura",
            "m.proxima_manutencao"
        );

    const { rows } = await pool.query(

        `
        SELECT
            m.id AS maquina_id,
            m.nome,
            m.proxima_manutencao,

            (
                CURRENT_DATE -
                m.proxima_manutencao
            )::integer AS dias_atraso

        FROM maquinas m

        WHERE
            m.proxima_manutencao IS NOT NULL

            AND m.proxima_manutencao < CURRENT_DATE

            ${wherePeriodo}

            AND NOT EXISTS (

                SELECT 1
                FROM ordens_servico os

                WHERE
                    os.maquina_id = m.id
                    AND os.tipo_manutencao = 'PREVENTIVA'
                    AND os.status IN (
                        'ABERTA',
                        'ATRIBUIDA',
                        'EM_ANDAMENTO'
                    )

            )

        ORDER BY
            dias_atraso DESC,
            m.nome ASC
        `,
        filtro.valores
    );

    return {
        resumo: {
            total: rows.length,
        },

        maquinas: rows,
    };
}







    async obterRankingTecnicos(
        dataInicio?:string,
        dataFim?:string
    ){


        const filtro =
            this.montarFiltroPeriodo(
                dataInicio,
                dataFim
            );



        const {rows}=

        await pool.query(`


        SELECT

        u.id,
        u.nome,
        COUNT(os.id) total


        FROM usuarios u


        INNER JOIN ordens_servico os

        ON os.id_tecnico=u.id



        WHERE os.status='FINALIZADA' and os.id_tecnico <> 7


        ${filtro.where}



        GROUP BY
        u.id,
        u.nome



        ORDER BY total DESC



        LIMIT 10



        `,
        filtro.valores);



        return rows;


    }









async obterCustos(
    dataInicio?: string,
    dataFim?: string
) {

    const filtro =
        this.montarFiltroPeriodo(
            dataInicio,
            dataFim
        );



    // =========================
    // RESUMO GERAL
    // =========================

    const resumo = await pool.query(

        `

        SELECT

        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
            ),
            0
        ) AS material,


        COALESCE(
            SUM(
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS terceirizado,


        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
                +
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS total


        FROM ordens_servico os


        WHERE os.status = 'FINALIZADA'


        ${filtro.where}


        `,

        filtro.valores

    );







    // =========================
    // CUSTO POR MÁQUINA
    // =========================


    const maquinas = await pool.query(

        `

        SELECT


        m.nome,


        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
            ),
            0
        ) AS material,


        COALESCE(
            SUM(
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS terceirizado,


        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
                +
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS total



        FROM maquinas m



        INNER JOIN ordens_servico os

        ON os.maquina_id = m.id



        WHERE os.status = 'FINALIZADA'



        ${filtro.where}



        GROUP BY m.id, m.nome



        ORDER BY total DESC



        LIMIT 10



        `,

        filtro.valores

    );







    // =========================
    // CUSTO POR TIPO DE MANUTENÇÃO
    // =========================


    const tipos = await pool.query(

        `

        SELECT


        os.tipo_manutencao AS tipo,


        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
                +
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS total



        FROM ordens_servico os



        WHERE os.status = 'FINALIZADA'



        ${filtro.where}



        GROUP BY os.tipo_manutencao



        ORDER BY total DESC



        `,

        filtro.valores

    );







    // =========================
    // EVOLUÇÃO MENSAL
    // =========================


    const evolucao = await pool.query(

        `

        SELECT


        TO_CHAR(
            DATE_TRUNC(
                'month',
                os.data_resolucao
            ),
            'YYYY-MM'
        ) AS mes,



        COALESCE(
            SUM(
                COALESCE(os.valor_gasto,0)
                +
                COALESCE(os.valor_parceiro,0)
            ),
            0
        ) AS total



        FROM ordens_servico os



        WHERE os.status = 'FINALIZADA'



        ${filtro.where}



        GROUP BY
        DATE_TRUNC(
            'month',
            os.data_resolucao
        )



        ORDER BY mes



        `,

        filtro.valores

    );







    return {


        resumo: resumo.rows[0],


        maquinas: maquinas.rows,


        tipos_manutencao: tipos.rows,


        evolucao: evolucao.rows


    };

}









    async obterAlertas(){


        const {rows}=

        await pool.query(`


        SELECT

        id,
        descricao,
        prioridade,
        maquina_id



        FROM ordens_servico



        WHERE prioridade='CRITICA'


        AND status NOT IN(
            'FINALIZADA',
            'CANCELADA'
        )


        ORDER BY data_abertura DESC



        `);



        return rows;


    }









    // =========================
    // TECNICO
    // =========================



    async obterTotalOSTecnico(
        tecnicoId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total

        FROM ordens_servico


        WHERE id_tecnico=$1


        `,
        [tecnicoId]);



        return rows[0];


    }






    async obterOSTecnicoAbertas(
        tecnicoId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total


        FROM ordens_servico


        WHERE id_tecnico=$1


        AND status IN(
            'ABERTA',
            'ATRIBUIDA'
        )



        `,
        [tecnicoId]);



        return rows[0];


    }






    async obterAndamentoTecnico(
        tecnicoId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total


        FROM ordens_servico


        WHERE id_tecnico=$1


        AND status='EM_ANDAMENTO'



        `,
        [tecnicoId]);



        return rows[0];


    }







    async obterFinalizadasTecnico(
        tecnicoId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total


        FROM ordens_servico


        WHERE id_tecnico=$1


        AND status='FINALIZADA'



        `,
        [tecnicoId]);



        return rows[0];


    }







    async obterHistoricoTecnico(
        tecnicoId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT *


        FROM ordens_servico


        WHERE id_tecnico=$1


        ORDER BY data_abertura DESC


        LIMIT 20



        `,
        [tecnicoId]);



        return rows;


    }








    // =========================
    // OPERADOR
    // =========================



    async obterOSAbertasOperador(
        operadorId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total


        FROM ordens_servico


        WHERE id_solicitante=$1


        AND status IN(
            'ABERTA',
            'ATRIBUIDA',
            'EM_ANDAMENTO'
        )



        `,
        [operadorId]);



        return rows[0];


    }






    async obterOSFinalizadasOperador(
        operadorId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT COUNT(*) total


        FROM ordens_servico


        WHERE id_solicitante=$1


        AND status='FINALIZADA'



        `,
        [operadorId]);



        return rows[0];


    }







    async obterHistoricoOperador(
        operadorId:number
    ){


        const {rows}=

        await pool.query(`


        SELECT *


        FROM ordens_servico


        WHERE id_solicitante=$1


        ORDER BY data_abertura DESC


        LIMIT 20



        `,
        [operadorId]);



        return rows;


    }


}
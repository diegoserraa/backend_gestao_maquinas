-- Máquina "vinculada" de um cliente que gerencia o próprio parque de ativos
-- em outro sistema (ERP/CMMS dele) e só quer o sensor plugado aqui — não é
-- um cadastro completo (sem modelo/fabricante/plano de manutenção reais),
-- só o suficiente pra existir um maquina_id e colar telemetria nele.
-- A referência é opcional e livre: serve só pra quem cadastrou lembrar qual
-- é a máquina correspondente do lado do cliente (não existe sincronização
-- automática nenhuma com o sistema dele ainda).
CREATE TABLE IF NOT EXISTS maquinas_vinculo_externo (
    maquina_id         INTEGER PRIMARY KEY REFERENCES maquinas(id) ON DELETE CASCADE,
    referencia_externa TEXT,
    sistema_origem     TEXT,
    observacao         TEXT,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);

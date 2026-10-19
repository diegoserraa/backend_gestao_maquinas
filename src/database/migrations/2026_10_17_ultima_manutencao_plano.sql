-- Guarda "quando foi feita a última vez" no próprio plano — antes era só um
-- valor de entrada usado pra calcular a data e descartado; agora persiste,
-- pra aparecer como referência ao reabrir o plano depois.
ALTER TABLE planos_manutencao_preventiva
    ADD COLUMN IF NOT EXISTS ultima_manutencao DATE;

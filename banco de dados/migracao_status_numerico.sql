-- Migração para status numérico em orders
-- Remove o default antigo (texto)
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

-- Altera o tipo da coluna para inteiro, convertendo os valores existentes
ALTER TABLE orders ALTER COLUMN status TYPE INTEGER USING 
  CASE 
    WHEN status = 'aberto' THEN 0
    WHEN status = 'recebido' THEN 0
    WHEN status = 'aceito' THEN 1
    WHEN status = 'confirmado' THEN 1
    WHEN status = 'preparacao' THEN 2
    WHEN status = 'em_preparacao' THEN 2
    WHEN status = 'finalizado' THEN 3
    WHEN status = 'pronto' THEN 3
    WHEN status = 'entrega' THEN 4
    WHEN status = 'saiu_para_entrega' THEN 4
    WHEN status = 'concluido' THEN 5
    ELSE 0
  END;

-- Define o novo default como 0
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 0;

-- Comentário explicativo
COMMENT ON COLUMN orders.status IS '0:Recebido, 1:Aceito, 2:Preparação, 3:Finalizado, 4:Entrega, 5:Concluído';

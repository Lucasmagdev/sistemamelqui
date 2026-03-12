-- Zerar estoque (deixar quantidades em 0)
-- Uso: executar no SQL Editor do Supabase
-- Observacao: este script limpa o saldo de estoque sem apagar o cadastro de produtos.

BEGIN;

-- 1) Zera saldo fisico dos lotes
UPDATE batches
SET quantidade_disponivel = 0
WHERE COALESCE(quantidade_disponivel, 0) <> 0;

-- 2) Limpa movimentacoes para o saldo consolidado (stock_balances) voltar para 0
DELETE FROM stock_movements;

-- 3) Resolve alertas abertos
UPDATE stock_alert_events
SET resolved_at = NOW()
WHERE resolved_at IS NULL;

COMMIT;

-- Validacao: deve retornar 0 linhas
SELECT produto_id, saldo_qty
FROM stock_balances
WHERE COALESCE(saldo_qty, 0) <> 0;

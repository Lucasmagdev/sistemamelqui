-- Adiciona campo email_cliente na tabela orders
ALTER TABLE orders ADD COLUMN email_cliente VARCHAR(100);

-- Atualiza os pedidos existentes com o email do cliente
UPDATE orders SET email_cliente = c.email
FROM clients c
WHERE orders.cliente_id = c.id;

-- Garante que novos pedidos salvem o email do cliente
-- (ajuste no código necessário)

-- Cria uma view para facilitar consulta de pedidos por email
CREATE OR REPLACE VIEW pedidos_por_email AS
SELECT o.id AS pedido_id, o.email_cliente, o.cliente_id, o.data_pedido, oi.id AS item_id, oi.produto_id, oi.quantidade, oi.preco_unitario
FROM orders o
LEFT JOIN order_items oi ON oi.pedido_id = o.id;

-- Agora é possível consultar pedidos por email_cliente diretamente
-- Exemplo:
-- SELECT * FROM pedidos_por_email WHERE email_cliente = 'cliente@email.com';

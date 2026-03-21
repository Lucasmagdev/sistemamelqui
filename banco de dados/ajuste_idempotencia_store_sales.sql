CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_store_sale_tipo_produto_batch
  ON public.stock_movements (source_type, source_id, tipo, produto_id, COALESCE(batch_id, 0))
  WHERE source_type = 'manual'
    AND source_id IS NOT NULL
    AND source_id LIKE 'store_sale:%';

-- Fase 3 - Sistema de Estoque em producao (idempotente)
-- Data: 2026-03-11

-- 1) Produtos: controle de estoque por produto
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_min NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_unit VARCHAR(10) DEFAULT 'LB';

UPDATE products
SET stock_unit = COALESCE(NULLIF(UPPER(stock_unit), ''), NULLIF(UPPER(unidade), ''), 'LB')
WHERE stock_unit IS NULL OR stock_unit = '';

ALTER TABLE products
  ALTER COLUMN stock_unit SET DEFAULT 'LB';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_stock_unit_chk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_stock_unit_chk CHECK (UPPER(stock_unit) IN ('LB', 'KG', 'UN'));
  END IF;
END;
$$;

-- 2) Lotes: ampliar estrutura para saldo por lote e rastreio
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS quantidade_disponivel NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS unidade VARCHAR(10),
  ADD COLUMN IF NOT EXISTS origem VARCHAR(255),
  ADD COLUMN IF NOT EXISTS custo_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS data_entrada TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS invoice_import_id BIGINT;

UPDATE batches
SET quantidade_disponivel = quantidade
WHERE quantidade_disponivel IS NULL;

UPDATE batches b
SET unidade = COALESCE(NULLIF(UPPER(b.unidade), ''), NULLIF(UPPER(p.stock_unit), ''), NULLIF(UPPER(p.unidade), ''), 'LB')
FROM products p
WHERE p.id = b.produto_id
  AND (b.unidade IS NULL OR b.unidade = '');

ALTER TABLE batches
  ALTER COLUMN quantidade_disponivel SET DEFAULT 0;

ALTER TABLE batches
  ALTER COLUMN unidade SET DEFAULT 'LB';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'batches_unidade_chk'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_unidade_chk CHECK (UPPER(unidade) IN ('LB', 'KG', 'UN'));
  END IF;
END;
$$;

-- 3) Movimentacoes de estoque (trilha auditavel)
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entry', 'exit', 'adjust', 'reversal')),
  produto_id BIGINT NOT NULL REFERENCES products(id),
  batch_id BIGINT REFERENCES batches(id),
  qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit VARCHAR(10) NOT NULL DEFAULT 'LB' CHECK (unit IN ('LB', 'KG', 'UN')),
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('manual', 'order', 'invoice')),
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_produto_created_at
  ON stock_movements (produto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_source
  ON stock_movements (source_type, source_id);

-- Idempotencia para pedido concluido / estorno por lote
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_order_tipo_produto_batch
  ON stock_movements (source_type, source_id, tipo, produto_id, COALESCE(batch_id, 0))
  WHERE source_type = 'order' AND source_id IS NOT NULL;

-- 4) Importacao de nota fiscal por foto
CREATE TABLE IF NOT EXISTS invoice_imports (
  id BIGSERIAL PRIMARY KEY,
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processed', 'review_required', 'applied', 'failed')),
  file_bucket VARCHAR(100),
  file_path TEXT,
  file_url TEXT,
  ocr_text TEXT,
  ai_json JSONB,
  review_json JSONB,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'batches_invoice_import_fk'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_invoice_import_fk
      FOREIGN KEY (invoice_import_id) REFERENCES invoice_imports(id);
  END IF;
END;
$$;

-- 5) Historico de alerta de estoque
CREATE TABLE IF NOT EXISTS stock_alert_events (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('low_stock')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_alert_events_open
  ON stock_alert_events (product_id, alert_type)
  WHERE resolved_at IS NULL;

-- 6) View de saldo atual por produto
CREATE OR REPLACE VIEW stock_balances AS
SELECT
  p.id AS produto_id,
  COALESCE(
    SUM(
      CASE
        WHEN sm.tipo IN ('entry', 'reversal') THEN sm.qty
        WHEN sm.tipo IN ('exit') THEN -sm.qty
        WHEN sm.tipo = 'adjust' THEN sm.qty
        ELSE 0
      END
    ),
    0
  ) AS saldo_qty,
  MAX(sm.created_at) AS last_movement_at
FROM products p
LEFT JOIN stock_movements sm ON sm.produto_id = p.id
GROUP BY p.id;

-- 7) Conversao de unidade
CREATE OR REPLACE FUNCTION convert_quantity_unit(
  p_qty NUMERIC,
  p_from_unit TEXT,
  p_to_unit TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  from_u TEXT := UPPER(COALESCE(p_from_unit, 'LB'));
  to_u TEXT := UPPER(COALESCE(p_to_unit, 'LB'));
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF from_u = to_u THEN
    RETURN p_qty;
  END IF;

  IF from_u = 'KG' AND to_u = 'LB' THEN
    RETURN p_qty * 2.2046226218;
  END IF;

  IF from_u = 'LB' AND to_u = 'KG' THEN
    RETURN p_qty / 2.2046226218;
  END IF;

  IF from_u = 'UN' OR to_u = 'UN' THEN
    RAISE EXCEPTION 'Conversao invalida entre unidades: % -> %', from_u, to_u;
  END IF;

  RAISE EXCEPTION 'Unidade invalida: % -> %', from_u, to_u;
END;
$$;

-- 8) Aplicacao transacional de nota revisada
CREATE OR REPLACE FUNCTION apply_invoice_import(
  p_invoice_id BIGINT,
  p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice invoice_imports%ROWTYPE;
  v_item JSONB;
  v_items JSONB;
  v_count INTEGER := 0;
  v_product_id BIGINT;
  v_qty NUMERIC;
  v_input_unit TEXT;
  v_target_unit TEXT;
  v_qty_converted NUMERIC;
  v_cost_unit NUMERIC;
  v_cost_total NUMERIC;
  v_batch_id BIGINT;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_invoice_id obrigatorio';
  END IF;

  SELECT * INTO v_invoice FROM invoice_imports WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_import % nao encontrado', p_invoice_id;
  END IF;

  IF v_invoice.status = 'applied' THEN
    RAISE EXCEPTION 'invoice_import % ja aplicado', p_invoice_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM stock_movements sm
    WHERE sm.source_type = 'invoice'
      AND sm.source_id = p_invoice_id::TEXT
      AND sm.tipo = 'entry'
  ) THEN
    RAISE EXCEPTION 'invoice_import % ja possui entradas aplicadas', p_invoice_id;
  END IF;

  v_items := COALESCE(p_payload -> 'items', '[]'::jsonb);

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Payload sem itens para aplicar';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id := COALESCE((v_item ->> 'product_id')::BIGINT, (v_item ->> 'productId')::BIGINT);
    v_qty := COALESCE((v_item ->> 'quantity')::NUMERIC, (v_item ->> 'qty')::NUMERIC);
    v_input_unit := UPPER(COALESCE(v_item ->> 'unit', 'LB'));
    v_cost_unit := COALESCE((v_item ->> 'unit_cost')::NUMERIC, (v_item ->> 'valor_unitario')::NUMERIC, 0);

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Item sem product_id: %', v_item;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade invalida no item: %', v_item;
    END IF;

    SELECT UPPER(COALESCE(NULLIF(stock_unit, ''), NULLIF(unidade, ''), 'LB'))
      INTO v_target_unit
    FROM products
    WHERE id = v_product_id;

    IF v_target_unit IS NULL THEN
      RAISE EXCEPTION 'Produto % nao encontrado', v_product_id;
    END IF;

    v_qty_converted := convert_quantity_unit(v_qty, v_input_unit, v_target_unit);
    v_cost_total := ROUND(v_qty * COALESCE(v_cost_unit, 0), 2);

    INSERT INTO batches (
      produto_id,
      quantidade,
      quantidade_disponivel,
      unidade,
      origem,
      custo_total,
      custo_unitario,
      observacoes,
      data_validade,
      data_entrada,
      invoice_import_id
    )
    VALUES (
      v_product_id,
      ROUND(v_qty_converted, 3),
      ROUND(v_qty_converted, 3),
      v_target_unit,
      COALESCE(v_item ->> 'supplier', p_payload ->> 'supplier'),
      v_cost_total,
      COALESCE(v_cost_unit, 0),
      COALESCE(v_item ->> 'description', v_item ->> 'descricao'),
      NULLIF(v_item ->> 'expiry_date', '')::DATE,
      NOW(),
      p_invoice_id
    )
    RETURNING id INTO v_batch_id;

    INSERT INTO stock_movements (
      tipo,
      produto_id,
      batch_id,
      qty,
      unit,
      source_type,
      source_id,
      metadata
    )
    VALUES (
      'entry',
      v_product_id,
      v_batch_id,
      ROUND(v_qty_converted, 3),
      v_target_unit,
      'invoice',
      p_invoice_id::TEXT,
      v_item
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE invoice_imports
  SET
    status = 'applied',
    review_json = p_payload,
    error = NULL,
    processed_at = COALESCE(processed_at, NOW()),
    applied_at = NOW()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'items_applied', v_count
  );
END;
$$;

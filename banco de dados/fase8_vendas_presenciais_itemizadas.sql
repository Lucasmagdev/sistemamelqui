-- Fase 8 - vendas presenciais itemizadas com baixa de estoque
-- Data: 2026-03-14

CREATE TABLE IF NOT EXISTS store_sales (
  id BIGSERIAL PRIMARY KEY,
  origin VARCHAR(20) NOT NULL DEFAULT 'store' CHECK (origin = 'store'),
  sale_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  payment_method VARCHAR(20) NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_sales_sale_datetime
  ON store_sales (sale_datetime DESC);

CREATE TABLE IF NOT EXISTS store_sale_items (
  id BIGSERIAL PRIMARY KEY,
  store_sale_id BIGINT NOT NULL REFERENCES store_sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(10) NOT NULL DEFAULT 'UN' CHECK (unit IN ('LB', 'KG', 'UN')),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_sale_items_sale
  ON store_sale_items (store_sale_id);

CREATE INDEX IF NOT EXISTS idx_store_sale_items_product
  ON store_sale_items (product_id);

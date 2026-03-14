-- Fases 2, 6, 7, 8, 9 e 10
-- Data: 2026-03-14
-- Estruturas operacionais para WhatsApp, vendas presenciais, financeiro,
-- funcionarios, relatorios e assistente read-only.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS email_cliente VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS change_for NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) DEFAULT 'entrega',
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(20),
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_source_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_source_chk CHECK (source IN ('delivery', 'store'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_delivery_mode_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_delivery_mode_chk CHECK (delivery_mode IN ('entrega', 'retirada'));
  END IF;
END;
$$;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unidade VARCHAR(10) DEFAULT 'LB',
  ADD COLUMN IF NOT EXISTS tipo_corte VARCHAR(50),
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_unidade_chk'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_unidade_chk CHECK (UPPER(unidade) IN ('LB', 'KG', 'UN'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  target VARCHAR(20) NOT NULL CHECK (target IN ('store', 'client')),
  event_type VARCHAR(60) NOT NULL,
  destination_phone VARCHAR(30),
  message_text TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  local_status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (local_status IN ('queued', 'failed', 'delivered', 'read', 'unknown', 'not_sent')),
  error_detail TEXT,
  message_id TEXT,
  zaap_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order_created_at
  ON whatsapp_messages (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id
  ON whatsapp_messages (message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_zaap_id
  ON whatsapp_messages (zaap_id);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  event_type VARCHAR(60),
  message_id TEXT,
  zaap_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_received_at
  ON whatsapp_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_message_id
  ON whatsapp_webhook_events (message_id);

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

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('carne', 'limpeza', 'aluguel', 'outras')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  competency_date DATE NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  attachment_bucket VARCHAR(100),
  attachment_path TEXT,
  attachment_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_competency_date
  ON expenses (competency_date DESC);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(120),
  role_title VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_active
  ON employees (active);

CREATE TABLE IF NOT EXISTS employee_payments (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_reference DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  attachment_bucket VARCHAR(100),
  attachment_path TEXT,
  attachment_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_payments_employee_week
  ON employee_payments (employee_id, week_reference DESC);

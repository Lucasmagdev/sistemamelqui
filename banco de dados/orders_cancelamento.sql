-- Campos de auditoria para cancelamento de pedidos.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_canceled_at
  ON public.orders (canceled_at DESC)
  WHERE canceled_at IS NOT NULL;

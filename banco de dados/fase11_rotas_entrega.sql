CREATE TABLE IF NOT EXISTS public.delivery_route_batches (
  id BIGSERIAL PRIMARY KEY,
  route_date DATE NOT NULL,
  label TEXT NOT NULL,
  notes TEXT NULL,
  public_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',
  filters_snapshot JSONB NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_route_batches_status_chk CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_batches_route_date
  ON public.delivery_route_batches (route_date DESC);

CREATE TABLE IF NOT EXISTS public.delivery_route_orders (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES public.delivery_route_batches(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  route_order INTEGER NOT NULL DEFAULT 1,
  region_label TEXT NULL,
  city_snapshot TEXT NULL,
  full_address_snapshot TEXT NULL,
  client_name_snapshot TEXT NULL,
  phone_snapshot TEXT NULL,
  assigned_driver_name TEXT NULL,
  assigned_at TIMESTAMPTZ NULL,
  delivery_state TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ NULL,
  delivered_latitude DOUBLE PRECISION NULL,
  delivered_longitude DOUBLE PRECISION NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_route_orders_unique UNIQUE (batch_id, order_id),
  CONSTRAINT delivery_route_orders_state_chk CHECK (delivery_state IN ('pending', 'assigned', 'delivered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_orders_batch
  ON public.delivery_route_orders (batch_id, route_order ASC);

CREATE INDEX IF NOT EXISTS idx_delivery_route_orders_driver
  ON public.delivery_route_orders (batch_id, assigned_driver_name);

CREATE TABLE IF NOT EXISTS public.delivery_route_events (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES public.delivery_route_batches(id) ON DELETE CASCADE,
  order_id BIGINT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  route_order_id BIGINT NULL REFERENCES public.delivery_route_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  driver_name TEXT NULL,
  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,
  payload JSONB NULL DEFAULT '{}'::jsonb,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_route_events_type_chk CHECK (event_type IN ('batch_published', 'assigned', 'reordered', 'delivered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_events_batch
  ON public.delivery_route_events (batch_id, event_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_route_batches_updated_at ON public.delivery_route_batches;
CREATE TRIGGER trg_delivery_route_batches_updated_at
BEFORE UPDATE ON public.delivery_route_batches
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_delivery_route_orders_updated_at ON public.delivery_route_orders;
CREATE TRIGGER trg_delivery_route_orders_updated_at
BEFORE UPDATE ON public.delivery_route_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

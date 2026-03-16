BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_data_pedido_desc
  ON public.orders (data_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_data_pedido_desc
  ON public.orders (status, data_pedido DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'cliente_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_cliente_id ON public.orders (cliente_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'client_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders (client_id)';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_clients_vip
  ON public.clients (vip);

CREATE INDEX IF NOT EXISTS idx_clients_nome
  ON public.clients (nome);

CREATE INDEX IF NOT EXISTS idx_expenses_competency_date_desc
  ON public.expenses (competency_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_category_competency_date_desc
  ON public.expenses (category, competency_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_payments_paid_at_desc
  ON public.employee_payments (paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_payments_employee_paid_at_desc
  ON public.employee_payments (employee_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_sales_sale_datetime_desc
  ON public.store_sales (sale_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order_id
  ON public.whatsapp_messages (order_id);

DO $$
DECLARE
  orders_client_col TEXT;
  order_value_expr TEXT := '0';
  order_code_expr TEXT := 'NULL::text';
  client_document_expr TEXT := 'NULL::text';
  client_vip_expr TEXT := 'FALSE';
  client_vip_note_expr TEXT := 'NULL::text';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cliente_id'
  ) THEN
    orders_client_col := 'cliente_id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'client_id'
  ) THEN
    orders_client_col := 'client_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'valor_total'
  ) THEN
    order_value_expr := 'COALESCE(o.valor_total, 0)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total'
  ) THEN
    order_value_expr := 'COALESCE(o.total, 0)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'codigo_pedido'
  ) THEN
    order_code_expr := 'NULLIF(BTRIM(o.codigo_pedido::text), '''')';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'numero_pedido'
  ) THEN
    order_code_expr := 'NULLIF(BTRIM(o.numero_pedido::text), '''')';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'codigo'
  ) THEN
    order_code_expr := 'NULLIF(BTRIM(o.codigo::text), '''')';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'code'
  ) THEN
    order_code_expr := 'NULLIF(BTRIM(o.code::text), '''')';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'numero'
  ) THEN
    order_code_expr := 'NULLIF(BTRIM(o.numero::text), '''')';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'documento'
  ) THEN
    client_document_expr := 'c.documento';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'vip'
  ) THEN
    client_vip_expr := 'COALESCE(c.vip, FALSE)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'vip_observacao'
  ) THEN
    client_vip_note_expr := 'c.vip_observacao';
  END IF;

  IF orders_client_col IS NULL THEN
    EXECUTE format($view$
      CREATE OR REPLACE VIEW public.admin_client_order_counts AS
      SELECT
        c.id,
        c.nome,
        c.email,
        c.telefone,
        %1$s AS documento,
        %2$s AS vip,
        %3$s AS vip_observacao,
        0::bigint AS order_count,
        COALESCE(
          NULLIF(CONCAT_WS(', ',
            NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(c.endereco_rua), ''), NULLIF(BTRIM(c.endereco_numero), '')), ''),
            NULLIF(BTRIM(c.endereco_complemento), ''),
            NULLIF(CONCAT_WS(' - ', NULLIF(BTRIM(c.cidade), ''), NULLIF(BTRIM(c.estado), '')), ''),
            NULLIF(BTRIM(c.cep), '')
          ), ''),
          '-'
        ) AS address
      FROM public.clients c;
    $view$, client_document_expr, client_vip_expr, client_vip_note_expr);

    EXECUTE format($view$
      CREATE OR REPLACE VIEW public.admin_orders_enriched AS
      SELECT
        o.id,
        o.data_pedido,
        CASE
          WHEN BTRIM(COALESCE(o.status::text, '')) ~ '^[0-9]+$' THEN o.status::integer
          ELSE 0
        END AS status,
        (%1$s)::numeric AS value,
        %2$s AS explicit_code,
        'Cliente'::text AS client_name,
        '-'::text AS phone,
        '-'::text AS city,
        '-'::text AS full_address
      FROM public.orders o;
    $view$, order_value_expr, order_code_expr);
  ELSE
    EXECUTE format($view$
      CREATE OR REPLACE VIEW public.admin_client_order_counts AS
      SELECT
        c.id,
        c.nome,
        c.email,
        c.telefone,
        %1$s AS documento,
        %2$s AS vip,
        %3$s AS vip_observacao,
        COALESCE(order_counts.order_count, 0)::bigint AS order_count,
        COALESCE(
          NULLIF(CONCAT_WS(', ',
            NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(c.endereco_rua), ''), NULLIF(BTRIM(c.endereco_numero), '')), ''),
            NULLIF(BTRIM(c.endereco_complemento), ''),
            NULLIF(CONCAT_WS(' - ', NULLIF(BTRIM(c.cidade), ''), NULLIF(BTRIM(c.estado), '')), ''),
            NULLIF(BTRIM(c.cep), '')
          ), ''),
          '-'
        ) AS address
      FROM public.clients c
      LEFT JOIN (
        SELECT
          o.%4$I AS client_id,
          COUNT(*)::bigint AS order_count
        FROM public.orders o
        WHERE o.%4$I IS NOT NULL
        GROUP BY o.%4$I
      ) order_counts
        ON order_counts.client_id = c.id;
    $view$, client_document_expr, client_vip_expr, client_vip_note_expr, orders_client_col);

    EXECUTE format($view$
      CREATE OR REPLACE VIEW public.admin_orders_enriched AS
      SELECT
        o.id,
        o.data_pedido,
        CASE
          WHEN BTRIM(COALESCE(o.status::text, '')) ~ '^[0-9]+$' THEN o.status::integer
          ELSE 0
        END AS status,
        (%1$s)::numeric AS value,
        %2$s AS explicit_code,
        COALESCE(c.nome, 'Cliente') AS client_name,
        COALESCE(c.telefone, '-') AS phone,
        COALESCE(c.cidade, '-') AS city,
        COALESCE(
          NULLIF(CONCAT_WS(', ',
            NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(c.endereco_rua), ''), NULLIF(BTRIM(c.endereco_numero), '')), ''),
            NULLIF(BTRIM(c.endereco_complemento), ''),
            NULLIF(CONCAT_WS(' - ', NULLIF(BTRIM(c.cidade), ''), NULLIF(BTRIM(c.estado), '')), ''),
            NULLIF(BTRIM(c.cep), '')
          ), ''),
          '-'
        ) AS full_address
      FROM public.orders o
      LEFT JOIN public.clients c
        ON c.id = o.%3$I;
    $view$, order_value_expr, order_code_expr, orders_client_col);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_clients_summary(
  search_text TEXT DEFAULT NULL,
  segment_filter TEXT DEFAULT 'all',
  with_orders_filter BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  total_clients BIGINT,
  total_vips BIGINT,
  total_orders BIGINT,
  matching_clients BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT *
    FROM public.admin_client_order_counts c
    WHERE (
      COALESCE(search_text, '') = ''
      OR COALESCE(c.nome, '') ILIKE '%' || search_text || '%'
      OR COALESCE(c.email, '') ILIKE '%' || search_text || '%'
      OR COALESCE(c.telefone, '') ILIKE '%' || search_text || '%'
      OR COALESCE(c.documento, '') ILIKE '%' || search_text || '%'
    )
    AND (
      COALESCE(segment_filter, 'all') = 'all'
      OR (segment_filter = 'vip' AND COALESCE(c.vip, FALSE))
      OR (segment_filter = 'non_vip' AND NOT COALESCE(c.vip, FALSE))
    )
    AND (
      NOT COALESCE(with_orders_filter, FALSE)
      OR COALESCE(c.order_count, 0) > 0
    )
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM public.admin_client_order_counts),
    (SELECT COUNT(*)::bigint FROM public.admin_client_order_counts WHERE COALESCE(vip, FALSE)),
    (SELECT COUNT(*)::bigint FROM public.orders),
    (SELECT COUNT(*)::bigint FROM filtered);
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_finance_overview(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH expense_rows AS (
    SELECT category, amount
    FROM public.expenses
    WHERE competency_date >= DATE(start_date)
      AND competency_date <= DATE(end_date)
  ),
  payment_rows AS (
    SELECT
      ep.employee_id,
      ep.amount,
      COALESCE(e.name, 'Funcionario ' || ep.employee_id::text) AS employee_name
    FROM public.employee_payments ep
    LEFT JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.paid_at >= start_date
      AND ep.paid_at <= end_date
  ),
  expense_totals AS (
    SELECT ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM expense_rows
  ),
  payroll_totals AS (
    SELECT ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM payment_rows
  ),
  expenses_by_category AS (
    SELECT category, ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM expense_rows
    GROUP BY category
  ),
  payroll_by_employee AS (
    SELECT employee_name, ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM payment_rows
    GROUP BY employee_name
  )
  SELECT jsonb_build_object(
    'expensesTotal', COALESCE((SELECT total FROM expense_totals), 0),
    'payrollTotal', COALESCE((SELECT total FROM payroll_totals), 0),
    'totalOutflow', ROUND((
      COALESCE((SELECT total FROM expense_totals), 0)
      + COALESCE((SELECT total FROM payroll_totals), 0)
    )::numeric, 2),
    'expensesByCategory', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('category', category, 'total', total)
        ORDER BY category
      )
      FROM expenses_by_category
    ), '[]'::jsonb),
    'payrollByEmployee', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('employee_name', employee_name, 'total', total)
        ORDER BY employee_name
      )
      FROM payroll_by_employee
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_operational_summary(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH orders_base AS (
    SELECT
      id,
      DATE(data_pedido AT TIME ZONE 'UTC') AS day_key,
      CASE
        WHEN BTRIM(COALESCE(status::text, '')) ~ '^[0-9]+$' THEN status::integer
        ELSE 0
      END AS status,
      ROUND(COALESCE(valor_total, 0)::numeric, 2) AS amount,
      COALESCE(payment_method, 'nao_informado') AS payment_method
    FROM public.orders
    WHERE data_pedido >= start_date
      AND data_pedido <= end_date
  ),
  store_sales_base AS (
    SELECT
      id,
      DATE(sale_datetime AT TIME ZONE 'UTC') AS day_key,
      ROUND(COALESCE(total_amount, 0)::numeric, 2) AS amount,
      COALESCE(payment_method, 'nao_informado') AS payment_method,
      sale_datetime,
      total_amount,
      notes,
      created_by,
      created_at
    FROM public.store_sales
    WHERE sale_datetime >= start_date
      AND sale_datetime <= end_date
  ),
  expenses_base AS (
    SELECT
      id,
      description,
      category,
      ROUND(COALESCE(amount, 0)::numeric, 2) AS amount,
      competency_date,
      posted_at,
      notes,
      attachment_url,
      created_by,
      created_at
    FROM public.expenses
    WHERE competency_date >= DATE(start_date)
      AND competency_date <= DATE(end_date)
  ),
  payments_base AS (
    SELECT
      ep.id,
      ep.employee_id,
      ROUND(COALESCE(ep.amount, 0)::numeric, 2) AS amount,
      ep.week_reference,
      ep.paid_at,
      ep.notes,
      ep.attachment_url,
      ep.created_by,
      ep.created_at,
      COALESCE(e.name, 'Funcionario ' || ep.employee_id::text) AS employee_name
    FROM public.employee_payments ep
    LEFT JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.paid_at >= start_date
      AND ep.paid_at <= end_date
  ),
  days AS (
    SELECT generate_series(DATE(start_date), DATE(end_date), INTERVAL '1 day')::date AS day_key
  ),
  delivery_by_day AS (
    SELECT
      day_key,
      ROUND(COALESCE(SUM(CASE WHEN status = 5 THEN amount ELSE 0 END), 0)::numeric, 2) AS delivery
    FROM orders_base
    GROUP BY day_key
  ),
  store_by_day AS (
    SELECT
      day_key,
      ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS store
    FROM store_sales_base
    GROUP BY day_key
  ),
  timeline AS (
    SELECT
      d.day_key,
      COALESCE(delivery_by_day.delivery, 0)::numeric AS delivery,
      COALESCE(store_by_day.store, 0)::numeric AS store,
      ROUND((COALESCE(delivery_by_day.delivery, 0) + COALESCE(store_by_day.store, 0))::numeric, 2) AS total
    FROM days d
    LEFT JOIN delivery_by_day ON delivery_by_day.day_key = d.day_key
    LEFT JOIN store_by_day ON store_by_day.day_key = d.day_key
  ),
  payment_totals AS (
    SELECT payment_method, ROUND(COALESCE(SUM(total), 0)::numeric, 2) AS total
    FROM (
      SELECT payment_method, amount AS total FROM orders_base WHERE status = 5
      UNION ALL
      SELECT payment_method, amount AS total FROM store_sales_base
    ) unioned
    GROUP BY payment_method
  ),
  status_totals AS (
    SELECT status, COUNT(*)::bigint AS count
    FROM orders_base
    GROUP BY status
  ),
  expense_totals AS (
    SELECT category, ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM expenses_base
    GROUP BY category
  ),
  payroll_totals AS (
    SELECT employee_name, ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM payments_base
    GROUP BY employee_name
  ),
  delivery_summary AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN status = 5 THEN amount ELSE 0 END), 0)::numeric, 2) AS total,
      COUNT(*) FILTER (WHERE status = 5)::bigint AS concluded_count,
      COUNT(*)::bigint AS orders_count
    FROM orders_base
  ),
  store_summary AS (
    SELECT
      ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total,
      COUNT(*)::bigint AS sales_count
    FROM store_sales_base
  ),
  expense_summary AS (
    SELECT ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM expenses_base
  ),
  payroll_summary AS (
    SELECT ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS total
    FROM payments_base
  ),
  employee_summary AS (
    SELECT COUNT(*) FILTER (WHERE active IS DISTINCT FROM FALSE)::bigint AS active_employees
    FROM public.employees
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'delivery_sales_total', COALESCE((SELECT total FROM delivery_summary), 0),
      'delivery_sales_count', COALESCE((SELECT concluded_count FROM delivery_summary), 0),
      'store_sales_total', COALESCE((SELECT total FROM store_summary), 0),
      'total_sales', ROUND((
        COALESCE((SELECT total FROM delivery_summary), 0)
        + COALESCE((SELECT total FROM store_summary), 0)
      )::numeric, 2),
      'expenses_total', COALESCE((SELECT total FROM expense_summary), 0),
      'payroll_total', COALESCE((SELECT total FROM payroll_summary), 0),
      'orders_count', COALESCE((SELECT orders_count FROM delivery_summary), 0),
      'store_sales_count', COALESCE((SELECT sales_count FROM store_summary), 0),
      'active_employees', COALESCE((SELECT active_employees FROM employee_summary), 0)
    ),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', day_key::text,
          'delivery', delivery,
          'store', store,
          'total', total
        )
        ORDER BY day_key
      )
      FROM timeline
    ), '[]'::jsonb),
    'sales_by_payment', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('payment_method', payment_method, 'total', total)
        ORDER BY payment_method
      )
      FROM payment_totals
    ), '[]'::jsonb),
    'orders_by_status', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('status', status, 'count', count)
        ORDER BY status
      )
      FROM status_totals
    ), '[]'::jsonb),
    'expenses_by_category', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('category', category, 'total', total)
        ORDER BY category
      )
      FROM expense_totals
    ), '[]'::jsonb),
    'payroll_by_employee', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('employee_name', employee_name, 'total', total)
        ORDER BY employee_name
      )
      FROM payroll_totals
    ), '[]'::jsonb),
    'recent_expenses', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.competency_date DESC, x.id DESC)
      FROM (
        SELECT *
        FROM expenses_base
        ORDER BY competency_date DESC, id DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'recent_store_sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sale_datetime DESC, x.id DESC)
      FROM (
        SELECT *
        FROM store_sales_base
        ORDER BY sale_datetime DESC, id DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'recent_employee_payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.paid_at DESC, x.id DESC)
      FROM (
        SELECT *
        FROM payments_base
        ORDER BY paid_at DESC, id DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb)
  );
$$;

COMMIT;

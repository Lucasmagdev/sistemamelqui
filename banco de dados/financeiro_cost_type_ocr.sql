-- Amplia despesas com tipo de custo e trilha de OCR.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cost_type VARCHAR(20) NOT NULL DEFAULT 'variable',
  ADD COLUMN IF NOT EXISTS ocr_text TEXT,
  ADD COLUMN IF NOT EXISTS ocr_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_cost_type_chk'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_cost_type_chk CHECK (cost_type IN ('fixed', 'variable'));
  END IF;
END;
$$;

UPDATE public.expenses
SET cost_type = CASE
  WHEN LOWER(COALESCE(category, '')) IN ('aluguel') THEN 'fixed'
  ELSE 'variable'
END
WHERE cost_type IS NULL
   OR cost_type NOT IN ('fixed', 'variable');

CREATE INDEX IF NOT EXISTS idx_expenses_cost_type_competency_date
  ON public.expenses (cost_type, competency_date DESC);

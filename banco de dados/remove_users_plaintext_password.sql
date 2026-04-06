-- Remove o armazenamento legado de senha em texto puro da tabela users.
-- A autenticação deve continuar sendo feita exclusivamente pelo Supabase Auth.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'senha'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN senha DROP NOT NULL;

    UPDATE public.users
    SET senha = NULL
    WHERE senha IS NOT NULL;

    ALTER TABLE public.users
      DROP COLUMN senha;
  END IF;
END;
$$;

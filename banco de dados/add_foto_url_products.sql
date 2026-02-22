-- Adiciona o campo foto_url na tabela products
ALTER TABLE products ADD COLUMN foto_url text;

-- Opcional: pode adicionar um comentário para referência
COMMENT ON COLUMN products.foto_url IS 'URL da foto do produto (Supabase Storage)';

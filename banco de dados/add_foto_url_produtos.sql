-- Adiciona o campo foto_url na tabela produtos
ALTER TABLE produtos ADD COLUMN foto_url text;

-- Opcional: pode adicionar um comentário para referência
COMMENT ON COLUMN produtos.foto_url IS 'URL da foto do produto (Supabase Storage)';

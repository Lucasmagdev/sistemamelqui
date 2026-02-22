-- Criação da tabela products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(100),
    preco NUMERIC(10,2) NOT NULL,
    unidade VARCHAR(10),
    tenant_id INTEGER NOT NULL,
    foto_url TEXT
);

-- Comentário opcional para referência
COMMENT ON COLUMN products.foto_url IS 'URL da foto do produto (Supabase Storage)';

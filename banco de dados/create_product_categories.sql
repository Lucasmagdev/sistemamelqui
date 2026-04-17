-- Tabela de categorias de produtos gerenciáveis pelo admin
CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  nome_pt VARCHAR(100) NOT NULL,
  nome_en VARCHAR(100) NOT NULL,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por tenant
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON product_categories(tenant_id);

-- Migrar as 3 categorias fixas existentes (ajuste tenant_id conforme necessário)
INSERT INTO product_categories (nome_pt, nome_en, tenant_id) VALUES
  ('Cortes bovinos', 'Beef Cuts', 1),
  ('Cortes suinos', 'Pork Cuts', 1),
  ('Cortes de aves', 'Poultry Cuts', 1)
ON CONFLICT DO NOTHING;

-- Popula a tabela users com um admin e um usuário comum para o tenant padrão
-- Senhas em texto puro para exemplo (troque para hash em produção)
INSERT INTO users (nome, email, senha, tipo, tenant_id) VALUES
  ('Administrador', 'admin@acougue.com', 'admin123', 'admin', 1),
  ('Usuário Comum', 'usuario@acougue.com', 'usuario123', 'comum', 1);

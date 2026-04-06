-- Popula a tabela users com um admin e um usuário comum para o tenant padrão
-- A autenticação fica no Supabase Auth; esta tabela guarda apenas perfil e papel.
INSERT INTO users (nome, email, tipo, tenant_id) VALUES
  ('Administrador', 'admin@acougue.com', 'admin', 1),
  ('Usuário Comum', 'usuario@acougue.com', 'comum', 1);

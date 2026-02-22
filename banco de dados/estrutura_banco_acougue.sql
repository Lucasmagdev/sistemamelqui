-- Arquivo SQL completo para sistema de açougue (Supabase)
-- Estrutura de tabelas essenciais + catálogo completo de itens

-- Tabela de empresas (tenants)
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cnpj VARCHAR(20),
  endereco VARCHAR(200),
  contato VARCHAR(100)
);

-- Tabela de usuários
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  senha VARCHAR(200) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de clientes
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  -- documento VARCHAR(20) NULL, -- Campo não utilizado no cadastro
  endereco_rua VARCHAR(120),
  endereco_numero VARCHAR(12),
  -- endereco_tipo VARCHAR(20), -- Campo não utilizado no cadastro
  endereco_complemento VARCHAR(40),
  cidade VARCHAR(60),
  estado VARCHAR(4),
  cep VARCHAR(16),
  pais VARCHAR(40) DEFAULT 'USA',
  telefone VARCHAR(20),
  email VARCHAR(100),
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de produtos (itens do açougue)
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(50),
  preco NUMERIC(10,2) NOT NULL,
  unidade VARCHAR(10) DEFAULT 'LB',
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de lotes
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES products(id),
  quantidade NUMERIC(10,2) NOT NULL,
  data_fabricacao DATE,
  data_validade DATE,
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de pedidos
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clients(id),
  data_pedido TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'aberto',
  valor_total NUMERIC(10,2),
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de itens do pedido
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES orders(id),
  produto_id INTEGER REFERENCES products(id),
  quantidade NUMERIC(10,2) NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL
);

-- Tabela de alertas executivos
CREATE TABLE executive_alerts (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50),
  mensagem TEXT,
  data TIMESTAMP DEFAULT NOW(),
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de relatórios
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50),
  data_geracao TIMESTAMP DEFAULT NOW(),
  arquivo_url VARCHAR(200),
  tenant_id INTEGER REFERENCES tenants(id)
);

-- Tabela de configurações
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(50) NOT NULL,
  valor VARCHAR(200),
  tenant_id INTEGER REFERENCES tenants(id)
);
-- Inserção do tenant padrão para evitar erro de chave estrangeira
INSERT INTO tenants (nome, cnpj, endereco, contato) VALUES ('Tenant Padrão', '00.000.000/0000-00', 'Endereço Exemplo', 'Contato Exemplo');

INSERT INTO users (nome, email, senha, tipo, tenant_id) VALUES
  ('Administrador', 'admin@acougue.com', 'admin123', 'admin', 1),
  ('Usuário Comum', 'usuario@acougue.com', 'usuario123', 'comum', 1);

-- Clientes de exemplo para testes
INSERT INTO clients (nome, documento, endereco, telefone, email, tenant_id) VALUES
  ('João da Silva', '123.456.789-00', 'Rua das Flores, 123, São Paulo, SP', '(11) 99999-1111', 'joao.silva@email.com', 1),
  ('Maria Oliveira', '987.654.321-00', 'Av. Atlântica, 456, Rio de Janeiro, RJ', '(21) 98888-2222', 'maria.oliveira@email.com', 1),
  ('Carlos Souza', '111.222.333-44', 'Praça Sete, 789, Belo Horizonte, MG', '(31) 97777-3333', 'carlos.souza@email.com', 1),
  ('Ana Paula', '555.666.777-88', 'Rua XV de Novembro, 321, Curitiba, PR', '(41) 96666-4444', 'ana.paula@email.com', 1),
  ('Pedro Santos', '999.888.777-66', 'Av. Ipiranga, 654, Porto Alegre, RS', '(51) 95555-5555', 'pedro.santos@email.com', 1);

INSERT INTO products (nome, descricao, categoria, preco, unidade, tenant_id) VALUES
-- Carne Suína
('Bisteca Suína', 'Pork Chops', 'Carne Suína', 3.99, 'LB', 1),
('Lombo', 'Pork Loin', 'Carne Suína', 3.99, 'LB', 1),
('Barriga Chicharron', 'Pork Belly', 'Carne Suína', 4.99, 'LB', 1),
('Costelinha', 'Spare Ribs', 'Carne Suína', 4.49, 'LB', 1),
('Joelho', 'Pork Knuckle', 'Carne Suína', 3.99, 'LB', 1),
('Bacon Inteiro', NULL, 'Carne Suína', 6.99, 'LB', 1),
('Pé de Porco', 'Pig Feet', 'Carne Suína', 3.99, 'LB', 1),
('Pernil', 'Pork Shoulder', 'Carne Suína', 3.99, 'LB', 1),
('Orelha', 'Pig Ears', 'Carne Suína', 4.99, 'LB', 1),
('Rabinho', 'Pig Tail', 'Carne Suína', 3.99, 'LB', 1),
('Suan', 'Pork Spine', 'Carne Suína', 3.99, 'LB', 1),
('Toucinho Comum', 'Pork Fat', 'Carne Suína', 2.99, 'LB', 1),
-- Aves
('Coração de Frango', NULL, 'Aves', 3.99, 'LB', 1),
('Fígado de Frango', NULL, 'Aves', 2.99, 'LB', 1),
('Moela de Frango', NULL, 'Aves', 2.99, 'LB', 1),
('Pescoço de Peru', NULL, 'Aves', 3.49, 'LB', 1),
('Galinha Caipira', NULL, 'Aves', 20.00, 'UN', 1),
('Frango de Granja Inteiro', NULL, 'Aves', 2.49, 'LB', 1),
('Espetinho de Frango com Bacon', NULL, 'Aves', 5.99, 'LB', 1),
('Asa de Frango', 'Party Wings', 'Aves', 2.99, 'LB', 1),
('Peito de Frango', NULL, 'Aves', 3.49, 'LB', 1),
('Coxa e Sobrecoxa', NULL, 'Aves', 0.99, 'LB', 1),
('Pezinho de Frango', NULL, 'Aves', 3.99, 'LB', 1),
-- Cortes Bovinos
('Picanha Choice', NULL, 'Cortes Bovinos', 9.99, 'LB', 1),
('Picanha Prime', NULL, 'Cortes Bovinos', 12.99, 'LB', 1),
('Ribay Steak', NULL, 'Cortes Bovinos', 14.99, 'LB', 1),
('Alcatra com Picanha (Cortada)', NULL, 'Cortes Bovinos', 7.99, 'LB', 1),
('Alcatra com Picanha (Inteira)', NULL, 'Cortes Bovinos', 6.99, 'LB', 1),
('Contra Filé', NULL, 'Cortes Bovinos', 12.99, 'LB', 1),
('Cupim', NULL, 'Cortes Bovinos', 6.99, 'LB', 1),
('Cupim Recheado', NULL, 'Cortes Bovinos', 7.99, 'LB', 1),
('Patinho', NULL, 'Cortes Bovinos', 7.49, 'LB', 1),
('Fraldinha', 'Flap Meat', 'Cortes Bovinos', 11.99, 'LB', 1),
('File Mignon', NULL, 'Cortes Bovinos', 13.99, 'LB', 1),
('Tomahawk Steak', NULL, 'Cortes Bovinos', 14.99, 'LB', 1),
('T-Bone', NULL, 'Cortes Bovinos', 12.99, 'LB', 1),
('Ribeye', NULL, 'Cortes Bovinos', 14.99, 'LB', 1),
-- Espetinhos & Recheados
('Espetinho de Picanha/Rump', NULL, 'Espetinhos & Recheados', 10.99, 'LB', 1),
('Espetinho de Boi com Linguiça', NULL, 'Espetinhos & Recheados', 7.99, 'LB', 1),
('Espetinho de Boi com Jalapeños', NULL, 'Espetinhos & Recheados', 7.99, 'LB', 1),
('File Mignon com Bacon', NULL, 'Espetinhos & Recheados', 13.99, 'LB', 1),
('Costela de Boi Desossada e Recheada', NULL, 'Espetinhos & Recheados', 10.99, 'LB', 1),
('Pernil Recheado', NULL, 'Espetinhos & Recheados', 5.99, 'LB', 1),
('Lombo de Porco Recheado com Queijo', NULL, 'Espetinhos & Recheados', 5.99, 'LB', 1),
('Frango Desossado e Recheado', NULL, 'Espetinhos & Recheados', 6.99, 'LB', 1),
-- Outros & Kits
('Linguiça Mista para Churrasco', NULL, 'Outros & Kits', 4.99, 'LB', 1),
('Linguiça Defumada', NULL, 'Outros & Kits', 8.99, 'LB', 1),
('Linguiça de Frango Suasage', NULL, 'Outros & Kits', 5.99, 'LB', 1),
('Kit Feijoada Mix', NULL, 'Outros & Kits', 6.99, 'LB', 1),
('Carne de Sol', NULL, 'Outros & Kits', 9.99, 'LB', 1),
('Dobradinha', NULL, 'Outros & Kits', 5.99, 'LB', 1),
-- Linha Black Angus
('Black Angus (Peça)', NULL, 'Linha Black Angus', 5.99, 'LB', 1),
('Costela Black Angus Ribs', NULL, 'Linha Black Angus', 6.99, 'LB', 1),
('Traseiro Black Angus Hinds', NULL, 'Linha Black Angus', 6.99, 'LB', 1),
('Costela Janela (Sabor Imperial)', NULL, 'Linha Black Angus', 7.99, 'LB', 1),
-- Miúdos e Cortes Especiais
('Testículo de Boi', NULL, 'Miúdos e Cortes Especiais', 5.99, 'LB', 1),
('Almôndegas', NULL, 'Miúdos e Cortes Especiais', 4.99, 'LB', 1),
('Língua', 'Tongue', 'Miúdos e Cortes Especiais', 9.99, 'LB', 1),
('Maca de Peito', 'Brisket', 'Miúdos e Cortes Especiais', 7.99, 'LB', 1),
('Rabo de Boi', NULL, 'Miúdos e Cortes Especiais', 9.99, 'LB', 1),
('Coração de Boi', NULL, 'Miúdos e Cortes Especiais', 3.99, 'LB', 1),
('Pé de Boi', 'Mocotó', 'Miúdos e Cortes Especiais', 4.99, 'LB', 1),
-- Outros Cortes de Boi
('Maminha de Alcatra (Com ou sem recheio)', NULL, 'Outros Cortes de Boi', 6.99, 'LB', 1),
('Paleta', 'Top Blade', 'Outros Cortes de Boi', 6.99, 'LB', 1),
('Miolo de Paleta', 'Shoulder', 'Outros Cortes de Boi', 6.49, 'LB', 1),
('Lagartinho Trairinha', 'Chuck Tender', 'Outros Cortes de Boi', 5.99, 'LB', 1),
('Lagarto', 'Eye of Round', 'Outros Cortes de Boi', 7.49, 'LB', 1),
('Coxão Mole', 'Top Round', 'Outros Cortes de Boi', 6.99, 'LB', 1),
('Coxão Duro', 'Bottom Round', 'Outros Cortes de Boi', 7.49, 'LB', 1),
('Patinho', 'Knuckle/Sirloin Tip', 'Outros Cortes de Boi', 7.49, 'LB', 1),
('Osso Buco', 'Shank Bone-in', 'Outros Cortes de Boi', 5.99, 'LB', 1),
('Músculo', 'Shank Boneless', 'Outros Cortes de Boi', 6.99, 'LB', 1),
('Costela Gaúcha Janela', 'Flanken Cut/Short Ribs', 'Outros Cortes de Boi', 7.99, 'LB', 1),
('Miolo de Acém', 'Chuck', 'Outros Cortes de Boi', 6.99, 'LB', 1),
('Costela', 'Short Ribs', 'Outros Cortes de Boi', 7.99, 'LB', 1),
-- Outros Suínos e Embutidos
('Kielbasa', NULL, 'Outros Suínos e Embutidos', 5.99, 'LB', 1),
('Bife à Role', 'Stuffed Steak', 'Outros Suínos e Embutidos', 7.99, 'LB', 1),
('Porco com Jiló', NULL, 'Outros Suínos e Embutidos', 6.99, 'LB', 1),
('Linguiça Caseira', 'Homestyle', 'Outros Suínos e Embutidos', 5.99, 'LB', 1);

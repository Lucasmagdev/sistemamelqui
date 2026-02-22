-- Exemplo de insert de cliente com novo formato de endereço
INSERT INTO clients (
  nome, documento, endereco_rua, endereco_numero, endereco_tipo, endereco_complemento, cidade, estado, cep, pais, telefone, email, tenant_id
) VALUES
  ('João da Silva', NULL, 'Rua das Flores', '123', 'Rua', NULL, 'São Paulo', 'SP', '01001-000', 'USA', '(11) 99999-1111', 'joao.silva@email.com', 1),
  ('Maria Oliveira', NULL, 'Av. Atlântica', '456', 'Avenida', 'Apt 12', 'Rio de Janeiro', 'RJ', '22010-000', 'USA', '(21) 98888-2222', 'maria.oliveira@email.com', 1),
  ('Carlos Souza', NULL, 'Praça Sete', '789', 'Praça', 'Sala 5', 'Belo Horizonte', 'MG', '30111-000', 'USA', '(31) 97777-3333', 'carlos.souza@email.com', 1),
  ('Ana Paula', NULL, 'Rua XV de Novembro', '321', 'Rua', NULL, 'Curitiba', 'PR', '80020-310', 'USA', '(41) 96666-4444', 'ana.paula@email.com', 1),
  ('Pedro Santos', NULL, 'Av. Ipiranga', '654', 'Avenida', 'Suite 8', 'Porto Alegre', 'RS', '90160-000', 'USA', '(51) 95555-5555', 'pedro.santos@email.com', 1);

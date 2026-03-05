-- Adiciona campo VIP e observação na tabela de clientes
ALTER TABLE clients ADD COLUMN vip BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN vip_observacao VARCHAR(255);

-- Exemplo de consulta para filtrar VIPs
-- SELECT * FROM clients WHERE vip = TRUE;

-- Exemplo de atualização de status VIP
-- UPDATE clients SET vip = TRUE, vip_observacao = 'Compras frequentes' WHERE id = 123;

-- Exemplo de dashboard: contar VIPs
-- SELECT COUNT(*) FROM clients WHERE vip = TRUE;

-- Futuro: tabela de histórico de mudanças de status
CREATE TABLE vip_status_history (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  alterado_por INTEGER REFERENCES users(id),
  novo_status BOOLEAN,
  observacao VARCHAR(255),
  data_alteracao TIMESTAMP DEFAULT NOW()
);

-- Futuro: tabela de campanhas enviadas
CREATE TABLE vip_campaigns (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(100),
  mensagem TEXT,
  data_envio TIMESTAMP DEFAULT NOW(),
  enviado_por INTEGER REFERENCES users(id)
);

CREATE TABLE vip_campaign_clients (
  campaign_id INTEGER REFERENCES vip_campaigns(id),
  client_id INTEGER REFERENCES clients(id),
  enviado BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (campaign_id, client_id)
);

# Checklist Go Live

Checklist rapido para subir as fases 2, 6, 7, 8, 9 e 10 em producao.

## 1. Banco de dados

- [ ] Abrir o Supabase SQL Editor
- [ ] Executar [banco de dados/fases_2_6_7_8_9_10.sql](/c:/Users/Gontijo/Desktop/sistemamelqui/imperial-flow-gold/banco%20de%20dados/fases_2_6_7_8_9_10.sql)
- [ ] Confirmar criacao das tabelas:
  - [ ] `whatsapp_messages`
  - [ ] `whatsapp_webhook_events`
  - [ ] `store_sales`
  - [ ] `expenses`
  - [ ] `employees`
  - [ ] `employee_payments`
- [ ] Confirmar novas colunas em:
  - [ ] `orders`
  - [ ] `order_items`

## 2. Storage

- [ ] Confirmar se vai usar bucket unico ou buckets separados
- [ ] Se bucket unico:
  - [ ] confirmar existencia de `invoice-imports`
- [ ] Se buckets separados:
  - [ ] criar `finance-attachments`
  - [ ] criar `payroll-attachments`
- [ ] Confirmar politica de leitura:
  - [ ] publico
  - [ ] ou ajustar depois para signed URL

## 3. Variaveis do backend no Render

- [ ] Confirmar `SUPABASE_URL`
- [ ] Confirmar `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Confirmar `ZAPI_BASE_URL`
- [ ] Confirmar `ZAPI_CLIENT_TOKEN`
- [ ] Confirmar `ZAPI_INSTANCE_ID`
- [ ] Confirmar `ZAPI_INSTANCE_TOKEN`
- [ ] Confirmar `DEFAULT_COUNTRY_CODE`
- [ ] Confirmar `DEFAULT_MESSAGE_LOCALE`
- [ ] Confirmar `GEMINI_API_KEY`
- [ ] Confirmar `GEMINI_MODEL`
- [ ] Confirmar `SUPABASE_INVOICE_BUCKET`
- [ ] Confirmar `SUPABASE_FINANCE_BUCKET`
- [ ] Confirmar `SUPABASE_PAYROLL_BUCKET`
- [ ] Confirmar `CORS_ORIGIN` ou `CORS_ORIGINS`

## 4. Z-API

- [ ] Configurar webhook para:

```txt
https://SEU_BACKEND/api/zapi/webhook
```

- [ ] Confirmar que a instancia esta conectada
- [ ] Confirmar que a instancia consegue enviar mensagem manualmente
- [ ] Confirmar se a API retorna o numero conectado da instancia

## 5. Deploy backend

- [ ] Subir o backend atualizado
- [ ] Esperar o deploy concluir
- [ ] Testar:

```txt
GET /health
```

- [ ] Confirmar resposta:

```json
{ "ok": true }
```

## 6. Deploy frontend

- [ ] Confirmar `VITE_BACKEND_URL`
- [ ] Subir frontend atualizado
- [ ] Esperar deploy concluir
- [ ] Abrir painel admin e confirmar novas rotas:
  - [ ] `/admin/vendas`
  - [ ] `/admin/financeiro`
  - [ ] `/admin/funcionarios`
  - [ ] `/admin/relatorios`
  - [ ] `/admin/assistente`

## 7. Teste do checkout

- [ ] Abrir o site do cliente
- [ ] Montar carrinho
- [ ] Finalizar pedido
- [ ] Confirmar que o pedido foi criado
- [ ] Confirmar que o pedido apareceu no admin
- [ ] Abrir `Ver WhatsApp` no pedido
- [ ] Confirmar evento `order_created_store`

## 8. Teste do WhatsApp do cliente

- [ ] Alterar pedido de `Recebido` para `Confirmado`
- [ ] Confirmar evento `order_confirmed_client`
- [ ] Confirmar recebimento no cliente

- [ ] Alterar pedido de `Pronto` para `Saiu para entrega`
- [ ] Confirmar evento `order_dispatched_client`
- [ ] Confirmar recebimento no cliente

- [ ] Concluir pedido
- [ ] Confirmar evento `order_review_client`
- [ ] Confirmar mensagem pedindo avaliacao

## 9. Teste de conciliacao

- [ ] Abrir `Vendas`
- [ ] Registrar uma venda presencial
- [ ] Confirmar que entrou na listagem
- [ ] Confirmar que apareceu nos relatorios

## 10. Teste de financeiro

- [ ] Abrir `Financeiro`
- [ ] Registrar uma despesa
- [ ] Anexar comprovante opcional
- [ ] Confirmar que entrou na listagem
- [ ] Confirmar que entrou no resumo por categoria

## 11. Teste de funcionarios

- [ ] Abrir `Funcionarios`
- [ ] Cadastrar um funcionario
- [ ] Registrar um pagamento semanal
- [ ] Anexar comprovante opcional
- [ ] Confirmar historico visivel

## 12. Teste de relatorios

- [ ] Abrir `Relatorios`
- [ ] Confirmar carregamento sem erro
- [ ] Confirmar cards de resumo
- [ ] Confirmar grafico de vendas
- [ ] Confirmar pedidos por status
- [ ] Confirmar despesas por categoria
- [ ] Confirmar alertas de estoque
- [ ] Testar exportacao CSV

## 13. Teste do assistente

- [ ] Abrir `Assistente`
- [ ] Perguntar sobre vendas
- [ ] Perguntar sobre estoque
- [ ] Perguntar sobre despesas
- [ ] Perguntar sobre funcionarios
- [ ] Confirmar que responde sem erro

## 14. Validacao final

- [ ] Checkout funcionando
- [ ] Loja recebendo novo pedido no WhatsApp
- [ ] Cliente recebendo confirmacao
- [ ] Cliente recebendo aviso de envio
- [ ] Cliente recebendo mensagem de avaliacao
- [ ] Painel admin carregando rotas novas
- [ ] Vendas presenciais salvando
- [ ] Despesas salvando
- [ ] Funcionarios e pagamentos salvando
- [ ] Relatorios carregando com dados reais
- [ ] Assistente respondendo

## 15. Se algo falhar

- [ ] Verificar logs do Render backend
- [ ] Verificar se a migracao SQL foi aplicada
- [ ] Verificar env vars
- [ ] Verificar buckets
- [ ] Verificar webhook da Z-API
- [ ] Verificar `Ver WhatsApp` no pedido para identificar o motivo

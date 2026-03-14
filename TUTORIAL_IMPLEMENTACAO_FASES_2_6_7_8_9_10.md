# Tutorial de Implementacao das Fases 2, 6, 7, 8, 9 e 10

Este arquivo explica como colocar em producao as mudancas que foram adicionadas no projeto `Imperial Flow Gold`.

O objetivo aqui nao e explicar o codigo linha por linha. O foco e mostrar:
- o que foi alterado
- o que precisa ser aplicado no banco
- o que precisa ser configurado no backend
- o que precisa ser conferido na Z-API
- o que ainda pode precisar de ajuste antes de ir para producao

## 1. O que foi implementado

As mudancas entregues nesta etapa cobrem:

- Fase 2:
  - criacao de pedido pelo backend
  - envio de WhatsApp para a loja no momento do novo pedido
  - envio de WhatsApp para o cliente em:
    - pedido confirmado
    - saiu para entrega
    - pedido concluido com pedido de avaliacao
  - log de mensagens WhatsApp por pedido
  - webhook para receber atualizacao de status da Z-API

- Fase 8:
  - modulo de venda presencial simples
  - conciliacao de delivery com venda presencial

- Fase 6:
  - modulo financeiro com despesas
  - upload opcional de comprovante

- Fase 7:
  - cadastro de funcionarios
  - pagamentos semanais
  - upload opcional de comprovante

- Fase 9:
  - relatorios operacionais reais
  - exportacao CSV

- Fase 10:
  - assistente central read-only
  - Gemini como provedor

## 2. Arquivos principais alterados

### Backend

- `backend/src/index.js`
- `backend/.env.example`

### Frontend

- `src/pages/ClientePage.tsx`
- `src/pages/RelatoriosPage.tsx`
- `src/components/dashboard/OrderList.tsx`
- `src/App.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/AdminBottomDock.tsx`
- `src/components/AppHeader.tsx`
- `src/i18n/messages.ts`

### Novas telas

- `src/pages/VendasPage.tsx`
- `src/pages/FinanceiroPage.tsx`
- `src/pages/FuncionariosPage.tsx`
- `src/pages/AssistentePage.tsx`

### Novos arquivos auxiliares

- `src/lib/fileToDataUrl.ts`
- `banco de dados/fases_2_6_7_8_9_10.sql`

## 3. O que precisa mudar antes de funcionar em producao

Sim. Ainda precisa aplicar algumas mudancas operacionais.

### Obrigatorio

1. Aplicar a migracao SQL no Supabase.
2. Garantir que o backend do Render tenha as variaveis de ambiente novas.
3. Configurar o webhook da Z-API apontando para o backend.
4. Fazer deploy do backend e do frontend.

### Altamente recomendado

1. Criar buckets separados para comprovantes financeiros e comprovantes de pagamento.
2. Validar se a Z-API realmente expõe o numero conectado da instancia no endpoint usado.
3. Testar ponta a ponta em staging ou em um pedido real controlado.

## 4. Passo 1: aplicar a migracao no Supabase

No SQL Editor do Supabase, execute o arquivo:

- [fases_2_6_7_8_9_10.sql](/c:/Users/Gontijo/Desktop/sistemamelqui/imperial-flow-gold/banco%20de%20dados/fases_2_6_7_8_9_10.sql)

Essa migracao cria ou ajusta:

- colunas novas em `orders`
- colunas novas em `order_items`
- `whatsapp_messages`
- `whatsapp_webhook_events`
- `store_sales`
- `expenses`
- `employees`
- `employee_payments`

### Importante

Sem essa migracao:
- o checkout novo vai falhar
- o log de WhatsApp vai falhar
- vendas presenciais nao vao salvar
- financeiro e funcionarios nao vao salvar
- relatorios novos vao quebrar

## 5. Passo 2: revisar variaveis de ambiente no backend

No Render, backend, revise estas variaveis:

```env
CORS_ORIGIN=https://imperial-meat.netlify.app
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ZAPI_BASE_URL=https://api.z-api.io
ZAPI_CLIENT_TOKEN=...
ZAPI_INSTANCE_ID=...
ZAPI_INSTANCE_TOKEN=...
DEFAULT_COUNTRY_CODE=55
DEFAULT_MESSAGE_LOCALE=pt
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
SUPABASE_INVOICE_BUCKET=invoice-imports
SUPABASE_FINANCE_BUCKET=invoice-imports
SUPABASE_PAYROLL_BUCKET=invoice-imports
MAX_INVOICE_UPLOAD_BYTES=15728640
```

### Observacao

Hoje o codigo aceita usar o mesmo bucket para tudo.

Mas o ideal para producao e separar:

```env
SUPABASE_INVOICE_BUCKET=invoice-imports
SUPABASE_FINANCE_BUCKET=finance-attachments
SUPABASE_PAYROLL_BUCKET=payroll-attachments
```

Se voce separar, precisa criar esses buckets no Supabase Storage.

## 6. Passo 3: configurar buckets no Supabase Storage

### Opcao simples

Usar o bucket atual para tudo:

- `invoice-imports`

### Opcao recomendada

Criar:

- `invoice-imports`
- `finance-attachments`
- `payroll-attachments`

### Politicas

Como o upload esta sendo feito com a `service_role` no backend, o ponto mais importante e:

- o bucket existir
- o backend ter permissao de escrita

Se quiser abrir acesso de leitura publica aos comprovantes:
- use buckets publicos
- ou mantenha privado e depois implemente URL assinada

Hoje o codigo retorna `publicUrl`, entao o comportamento esperado e bucket publico.

## 7. Passo 4: configurar webhook da Z-API

O backend novo expõe:

```txt
POST /api/zapi/webhook
```

Se o backend estiver publicado em:

```txt
https://seu-backend.onrender.com
```

entao o webhook deve apontar para:

```txt
https://seu-backend.onrender.com/api/zapi/webhook
```

### O que esse webhook faz

- salva o evento bruto em `whatsapp_webhook_events`
- tenta localizar a mensagem em `whatsapp_messages`
- atualiza o status local para:
  - `queued`
  - `failed`
  - `delivered`
  - `read`
  - `unknown`

### Importante

Sem o webhook:
- a mensagem pode ser enviada
- mas o sistema nao vai saber se foi entregue ou lida

## 8. Passo 5: validar descoberta do numero da loja

O plano aprovado exige que o numero da loja seja descoberto pela propria instancia conectada da Z-API.

O backend tenta isso por endpoints de consulta da instancia.

### O risco aqui

Dependendo do plano da Z-API ou do formato da resposta:
- o endpoint pode mudar
- o payload pode vir com outro nome
- o numero pode nao vir

### Se isso acontecer

O sistema hoje foi feito para:
- nao bloquear a criacao do pedido
- registrar a falha no log de WhatsApp
- marcar o envio da loja como falho

### O que conferir

Depois do deploy:
1. crie um pedido de teste
2. abra a tela de pedidos
3. clique em `Ver WhatsApp`
4. veja se o evento `order_created_store` ficou:
   - `queued`, ou
   - `failed` com motivo `store-phone-discovery-failed`

Se falhar, o ajuste necessario sera no helper que descobre o numero da instancia dentro de:

- [backend/src/index.js](/c:/Users/Gontijo/Desktop/sistemamelqui/imperial-flow-gold/backend/src/index.js)

## 9. Passo 6: deploy do backend

Depois de aplicar a migracao e revisar env vars:

1. suba o codigo
2. deixe o Render redeployar
3. valide:

```txt
GET /health
```

Resposta esperada:

```json
{ "ok": true }
```

### Endpoints novos para testar

- `POST /api/orders`
- `GET /api/orders/:id/messages`
- `POST /api/zapi/webhook`
- `GET /api/store-sales`
- `POST /api/store-sales`
- `GET /api/expenses`
- `POST /api/expenses`
- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/:id`
- `GET /api/employee-payments`
- `POST /api/employee-payments`
- `GET /api/reports/operational`
- `GET /api/reports/operational.csv`
- `POST /api/assistant/query`

## 10. Passo 7: deploy do frontend

Depois do backend pronto:

1. deploy do frontend
2. confirme que `VITE_BACKEND_URL` aponta para o backend correto

Exemplo:

```env
VITE_BACKEND_URL=https://seu-backend.onrender.com
```

### O que muda no frontend

Antes:
- o pedido era salvo direto no Supabase

Agora:
- o checkout chama `POST /api/orders`

Entao, se `VITE_BACKEND_URL` estiver errado:
- o pedido nao fecha
- ou vai falhar com erro de rede

## 11. Passo 8: testes manuais recomendados

### Fluxo 1: novo pedido

1. entrar no site do cliente
2. montar carrinho
3. finalizar pedido
4. conferir no admin:
   - pedido criado
   - evento `order_created_store`
5. conferir se o WhatsApp chegou na loja

### Fluxo 2: confirmacao do pedido

1. no admin, mudar de `Recebido` para `Confirmado`
2. conferir no pedido:
   - evento `order_confirmed_client`
3. conferir se o cliente recebeu

### Fluxo 3: saiu para entrega

1. mudar de `Pronto` para `Saiu para entrega`
2. conferir evento `order_dispatched_client`
3. conferir mensagem no cliente

### Fluxo 4: conclusao com avaliacao

1. concluir pedido
2. conferir evento `order_review_client`
3. conferir mensagem pedindo avaliacao

### Fluxo 5: venda presencial

1. abrir `Vendas`
2. lancar venda presencial
3. conferir se aparece na listagem
4. conferir se aparece em `Relatorios`

### Fluxo 6: financeiro

1. abrir `Financeiro`
2. cadastrar despesa
3. anexar comprovante opcional
4. conferir resumo por categoria

### Fluxo 7: funcionarios

1. cadastrar funcionario
2. registrar pagamento semanal
3. anexar comprovante
4. conferir historico

### Fluxo 8: assistente

1. abrir `Assistente`
2. perguntar:
   - `quanto vendemos no delivery?`
   - `quais produtos estao com estoque baixo?`
   - `quanto gastamos este mes?`

## 12. Coisas que talvez precisem ser ajustadas

Sim. Existem pontos que ainda podem precisar de refinamento.

### 1. Rota de descoberta do numero da Z-API

Esse e o ponto mais sensivel.

Se a Z-API responder com formato diferente do esperado, o helper precisa ser ajustado.

### 2. Buckets de anexos

Hoje o codigo aceita bucket unico.

Se quiser separar corretamente:
- crie buckets dedicados
- troque as env vars

### 3. Politica de leitura de anexos

Se os buckets forem privados, os links diretos nao vao abrir.

Nesse caso, o backend precisa ser alterado depois para gerar signed URLs.

### 4. Validacao de admin

As telas novas seguem o padrao atual do projeto, mas a autenticacao do admin ainda e simples.

Isso nao foi endurecido nesta entrega.

### 5. Relatorios

Os relatorios agora sao reais, mas ainda sao operacionais.

Nao sao contabilidade completa e nao fazem DRE.

### 6. Assistente

O assistente e read-only.

Ele:
- consulta dados
- resume informacoes

Ele nao:
- cria registros
- altera pedidos
- executa automacoes

## 13. Ordem segura de implantacao

Use esta ordem:

1. aplicar SQL no Supabase
2. criar buckets se necessario
3. atualizar env vars do backend
4. configurar webhook da Z-API
5. deploy backend
6. testar `/health`
7. deploy frontend
8. testar checkout
9. testar fluxo de status
10. testar vendas, financeiro, funcionarios e relatorios

## 14. Checklist rapido

- migracao SQL aplicada
- buckets existentes
- env vars revisadas
- webhook da Z-API configurado
- backend publicado
- frontend publicado
- checkout criando pedido via backend
- loja recebendo novo pedido
- cliente recebendo confirmacao
- cliente recebendo envio realizado
- cliente recebendo mensagem de avaliacao
- relatorios carregando
- assistente respondendo

## 15. Proximo ajuste recomendado

Se eu fosse continuar a partir daqui, os proximos ajustes seriam:

1. endurecer a descoberta do numero da loja na Z-API com base no payload real da sua conta
2. melhorar o layout das telas novas para manter o mesmo padrao visual premium do restante do admin
3. criar signed URLs para anexos se os buckets ficarem privados
4. adicionar filtros e edicao nas telas de vendas, despesas e pagamentos
5. adicionar testes automatizados dos endpoints novos

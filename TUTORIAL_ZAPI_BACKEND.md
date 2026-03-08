# Tutorial Completo - Z-API no Fluxo de Pedidos (com Backend)

Este guia coloca o fluxo de WhatsApp no backend para enviar mensagens conforme o **navegador/dispositivo do cliente** (com base no ultimo `user-agent` salvo no cadastro/checkout).

## 1) O que foi implementado

## Fluxo de status com disparo
- `0 -> 1` (`Pedido Recebido` -> `Aceito/Confirmado`): envia mensagem de confirmacao.
- `3 -> 4` (`Finalizado/Pronto` -> `Saiu para Entrega`): envia mensagem de saida para entrega.

## Onde roda
- O envio roda no backend: `backend/src/index.js`.
- O admin nao envia mais WhatsApp direto do navegador.

## Como identifica o "navegador do cliente"
- O frontend cliente salva `navigator.userAgent` em `clients.last_user_agent`.
- O backend le esse campo e inclui variante no texto da mensagem.

---

## 2) Estrutura de arquivos adicionados/alterados

- `backend/package.json`
- `backend/.env.example`
- `backend/src/index.js`
- `banco de dados/add_last_user_agent_clients.sql`
- `src/components/dashboard/OrderList.tsx`
- `src/pages/ClientePage.tsx`
- `src/pages/CadastroPage.tsx`

---

## 3) Pre-requisitos

- Node.js 18+
- Projeto Supabase ativo
- Conta Z-API com instancia conectada

---

## 4) Banco de dados (obrigatorio)

Execute no SQL Editor do Supabase:

```sql
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS last_user_agent TEXT;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(8) DEFAULT 'pt';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS locale VARCHAR(8) DEFAULT 'pt';
```

Ou rode os arquivos:
- `banco de dados/add_last_user_agent_clients.sql`
- `banco de dados/add_locale_fields.sql`

---

## 5) Configurar backend

Entre na pasta do backend:

```bash
cd backend
npm install
```

Crie `.env` com base no `.env.example`:

```env
PORT=3001
CORS_ORIGIN=http://localhost:8080

SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY

ZAPI_BASE_URL=https://api.z-api.io
ZAPI_INSTANCE_ID=SEU_INSTANCE_ID
ZAPI_INSTANCE_TOKEN=SEU_INSTANCE_TOKEN
ZAPI_CLIENT_TOKEN=SEU_CLIENT_TOKEN

DEFAULT_COUNTRY_CODE=55
DEFAULT_MESSAGE_LOCALE=pt
```

## Observacoes importantes
- Use **SERVICE ROLE KEY** no backend, nunca no frontend.
- `CORS_ORIGIN` deve apontar para a URL do frontend.
- Telefone e normalizado para incluir DDI (default `55`) quando necessario.

---

## 6) Subir backend local

```bash
cd backend
npm run dev
```

Teste healthcheck:

```bash
curl http://localhost:3001/health
```

Esperado:

```json
{ "ok": true }
```

---

## 7) Configurar frontend para usar backend

No `.env` da raiz do frontend, adicione:

```env
VITE_BACKEND_URL=http://localhost:3001
```

Depois rode frontend:

```bash
npm install
npm run dev
```

---

## 8) Como testar ponta a ponta

1. Garanta que backend e frontend estao rodando.
2. Entre no painel admin (`/admin/pedidos`).
3. Mude um pedido de:
- `Pedido Recebido` para `Aceito/Confirmado` (`0 -> 1`)
4. Verifique:
- status atualizado
- resposta do backend com `notification.sent = true`
- mensagem recebida no WhatsApp do cliente
5. Depois mude de:
- `Finalizado/Pronto` para `Saiu para Entrega` (`3 -> 4`)

Se `notification.sent = false`, veja `notification.reason`:
- `missing-phone`
- `missing-zapi-config`
- `zapi-http-...`
- `no-notification-transition`

---

## 9) Endpoint backend

## Atualizar status de pedido
`POST /api/orders/:id/status`

Body:

```json
{ "newStatus": 1 }
```

Resposta exemplo:

```json
{
  "ok": true,
  "previousStatus": 0,
  "newStatus": 1,
  "notification": {
    "sent": true
  }
}
```

---

## 10) Deploy do backend (producao)

Voce pode usar Render, Railway, Fly.io ou VPS. Exemplo com Render:

1. Suba o repositorio no GitHub.
2. No Render: **New + > Web Service**.
3. Selecione repo e pasta `backend`.
4. Build command:
```bash
npm install
```
5. Start command:
```bash
npm start
```
6. Configure variaveis de ambiente:
- `PORT`
- `CORS_ORIGIN` (URL do frontend em producao)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ZAPI_BASE_URL`
- `ZAPI_INSTANCE_ID`
- `ZAPI_INSTANCE_TOKEN`
- `ZAPI_CLIENT_TOKEN`
- `DEFAULT_COUNTRY_CODE`
7. Deploy.
8. Pegue a URL do backend publicado, por exemplo:
`https://imperial-flow-backend.onrender.com`
9. No frontend em producao, configure:
```env
VITE_BACKEND_URL=https://imperial-flow-backend.onrender.com
```

---

## 11) Recomendacoes de seguranca

- Nao exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Restrinja CORS para o dominio real do frontend.
- Adicione autenticao no endpoint `/api/orders/:id/status` (JWT admin) antes de ir para producao.
- Logue erros de integracao Z-API com monitoramento (Sentry, Logtail, etc).

---

## 12) Troubleshooting rapido

## Mensagem nao envia
- confira `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`
- confirme instancia Z-API conectada no WhatsApp
- valide telefone no banco (`clients.telefone`)

## Backend retorna 404 do pedido/cliente
- confira se `orders` esta com `cliente_id` preenchido
- confira se cliente existe em `clients`

## Erro de CORS no browser
- ajuste `CORS_ORIGIN` para URL correta do frontend

## Nao mudou status no painel
- confira `VITE_BACKEND_URL`
- confira se backend esta online

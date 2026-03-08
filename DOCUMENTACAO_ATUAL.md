# Documentação Atual do Projeto - Imperial Flow Gold

## 1) Visão geral
Aplicação web em React + Vite para operação de açougue/distribuidora, com:
- área pública/cliente (`/`)
- login e cadastro (`/login`, `/cadastro`)
- painel administrativo (`/admin/*`)
- persistência principal em Supabase (Auth + PostgreSQL + Storage)

## 2) Stack técnica
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router DOM
- Supabase JS (`@supabase/supabase-js`)
- Recharts (gráficos)
- Sonner (toasts)

## 3) Como rodar
Pré-requisitos:
- Node.js 18+
- npm

Comandos:
```bash
npm install
npm run dev
```

Variáveis de ambiente necessárias (arquivo `.env`):
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 4) Rotas implementadas
### Rotas públicas
- `/` -> `ClientePage`
- `/login` -> `LoginPage`
- `/cadastro` -> `CadastroPage`

### Rotas admin (protegidas por `role === "admin"` no `AuthContext`)
- `/admin` -> `DashboardPage`
- `/admin/estoque` -> `EstoquePage`
- `/admin/lotes/novo` -> `CadastroLotePage`
- `/admin/pedidos` -> `PedidosPage`
- `/admin/pedidos/novo` -> `NovoPedidoPage`
- `/admin/clientes` -> `ClientesAdminPage`
- `/admin/produtos` -> `ProductsAdminPage`
- `/admin/relatorios` -> `RelatoriosPage`

### Rota fallback
- `*` -> `NotFound`

## 5) O que está funcional hoje
## Autenticação e perfil
- Login real via `supabase.auth.signInWithPassword`.
- Pós-login busca em `users` para identificar `tipo` (`admin`/`cliente`).
- Sessão de papel (`role`) salva em `localStorage`.
- Cadastro de cliente cria:
  1. usuário no Supabase Auth
  2. registro em `clients`
  3. registro em `users` com `tipo = cliente`

## Área do cliente (`/`)
- Carrega produtos da tabela `products` (filtro por `tenant_id = 1` ou `null`).
- Busca, filtro por categoria, ordenação por preço, visualização em grid/lista.
- Carrinho com ajuste de quantidade e remoção de itens.
- Checkout em etapas (dados do cliente, pagamento, confirmação).
- Finalização cria pedido em:
  - `orders`
  - `order_items`
- Para usuário logado: botão "Repetir último pedido" busca último pedido e repopula carrinho.

## Admin - Dashboard (`/admin`)
- Leitura real de `orders` e `clients`.
- KPIs (pedidos, faturamento, ticket médio, pendentes).
- Gráficos de pedidos por dia e por status.
- Tabela com pedidos recentes.

## Admin - Pedidos (`/admin/pedidos`)
- Lista pedidos reais com junção manual:
  - `orders`
  - `clients`
  - `order_items`
  - `products`
- Filtros por busca/status/cidade.
- Exportação CSV.
- Mudança de status do pedido salva em `orders.status`.
- Etapa "Em preparação" exige confirmação de itens antes de avançar para "Finalizado/Pronto".

## Admin - Clientes (`/admin/clientes`)
- Lista clientes da tabela `clients`.
- Contagem de pedidos por cliente via `orders.client_id`.
- Busca, filtros (VIP/com pedidos), ordenação e paginação.
- Marcar/Remover VIP com persistência em `clients.vip` e `clients.vip_observacao`.
- Exportação CSV.

## Admin - Produtos (`/admin/produtos`)
- Listagem de `products`.
- Cadastro de produto com upload de imagem no bucket `produtos` (Supabase Storage).
- Edição de nome/preço/foto e atualização em `products`.
- Filtros por nome/categoria/unidade.

## 6) Funcional parcialmente/mocks
- `EstoquePage` usa `mockProdutos` (não lê banco).
- `NovoPedidoPage` usa `mockProdutos` e apenas mostra toast (não grava no banco).
- `CadastroLotePage` apenas toast (não grava em `batches`).
- `RelatoriosPage` usa dados estáticos locais.
- `AlertasPage` existe, mas usa `mockAlertas` e não está roteada no `App.tsx`.
- `PedidosEspecializadosPage` existe com `mockPedidos`, mas não está roteada.
- `ConfiguracoesPage` existe, mas não está roteada; altera apenas estado em memória (`TenantContext`), sem persistência.

## 7) Pontos de atenção técnicos atuais
- `AuthContext` guarda papel no `localStorage`; não valida sessão Supabase continuamente para proteção de rota.
- Botão de sino no header navega para `/admin/alertas`, mas essa rota não existe no roteador atual (cai em 404).
- Há inconsistências de encoding em alguns textos (acentuação quebrada em partes da UI).
- Parte dos fluxos usa moeda/formatação em USD e parte em BRL.
- `TenantContext` está em memória (não persiste após reload).

## 8) Estrutura de banco esperada (resumo)
Pelos SQLs do repositório, o projeto espera principalmente:
- `users`
- `clients`
- `products`
- `orders`
- `order_items`
- `batches` (ainda pouco usado no frontend)
- tabelas auxiliares de VIP e outras (`vip_status_history`, `vip_campaigns`, etc.)

Arquivos SQL relevantes:
- `banco de dados/estrutura_banco_acougue.sql`
- `banco de dados/create_products_table.sql`
- `banco de dados/migracao_status_numerico.sql`
- `banco de dados/vip_plan.sql`
- `banco de dados/add_foto_url_products.sql`
- `banco de dados/ajuste_orders_email.sql`

## 9) Status rápido por módulo
- Login/Cadastro: **funcional**
- Catálogo cliente + checkout + criação de pedido: **funcional**
- Dashboard admin: **funcional**
- Gestão de pedidos admin: **funcional**
- Gestão de clientes admin: **funcional**
- Gestão de produtos admin (inclui upload de imagem): **funcional**
- Estoque/lotes/relatórios/alertas: **parcial (mock/placeholder)**

## 10) Validação de testes
Tentativa de execução:
```bash
npm run test
```
No ambiente atual, falhou com erro de permissão de processo (`spawn EPERM`) ao iniciar Vitest/esbuild, então não foi possível validar a suíte de testes neste contexto.

# Tutorial Fase 3 (Pós-Migração)

Este guia cobre exatamente o que falta após a migração do estoque.

## 1) Rodar a migração SQL no Supabase

Arquivo da migração:
- `banco de dados/fase3_stock_system.sql`

Passos:
1. Abra Supabase Dashboard -> **SQL Editor**.
2. Clique em **New query**.
3. Cole o conteúdo de `banco de dados/fase3_stock_system.sql`.
4. Execute (`Run`).
5. Confirme que criou/atualizou:
   - colunas em `products` (`stock_min`, `stock_enabled`, `stock_unit`)
   - colunas em `batches` (`quantidade_disponivel`, `unidade`, etc.)
   - tabelas `stock_movements`, `invoice_imports`, `stock_alert_events`
   - view `stock_balances`
   - functions `convert_quantity_unit` e `apply_invoice_import`

## 2) Configurar variáveis no backend

Fonte de verdade:
- `backend/.env.example`

Crie o arquivo local:
```powershell
Copy-Item backend/.env.example backend/.env
```

Preencha no `backend/.env` (local):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (obrigatório: **service_role**, não `anon`)
- `SUPABASE_INVOICE_BUCKET=invoice-imports`
- `MAX_INVOICE_UPLOAD_BYTES=15728640`
- `PAPERLESS_OCR_ENDPOINT`
- `PAPERLESS_API_TOKEN` (se seu endpoint exigir)
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-1.5-pro`

No Render (produção):
1. Abra serviço backend.
2. Vá em **Environment**.
3. Adicione as mesmas variáveis.
4. Salve.

## 3) Garantir bucket `invoice-imports`

No Supabase Dashboard:
1. Vá em **Storage**.
2. Clique em **New bucket**.
3. Nome: `invoice-imports`.
4. Deixe privado (recomendado).

Política mínima:
- Backend com `service_role` já consegue upload via API.
- Se quiser acesso público às imagens/PDFs, marque bucket como public (opcional).

## 4) Reiniciar backend

Local:
```powershell
cd backend
npm run dev
```

Produção (Render):
- Clique em **Manual Deploy** -> **Deploy latest commit**
  ou **Restart service** (após salvar env vars).

## 5) Testar fluxo completo

Use backend em execução e frontend aberto.

### 5.1 Smoke check
```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3001/api/stock/balance
```
Esperado:
- `/health` retorna `{ ok: true }`
- `/api/stock/balance` retorna lista de produtos

### 5.2 Entrada manual
1. Abra `/admin/lotes/novo`.
2. Lance entrada manual de um produto.
3. Vá para `/admin/estoque`.
4. Confirme aumento de saldo e "última movimentação".

### 5.3 Baixa automática ao concluir pedido
1. Crie pedido com produto controlado.
2. No admin, avance status até `Concluído (5)`.
3. Verifique redução de saldo em `/admin/estoque`.
4. Reenvie status `5` e confirme que não baixa de novo.

### 5.4 Estorno automático
1. Pegue pedido concluído.
2. Volte status para `< 5`.
3. Confirme recomposição do saldo.

### 5.5 Nota por foto
1. Em `/admin/lotes/novo`, seção de nota fiscal:
   - upload
   - processar OCR + IA
   - revisar mapeamento dos itens
   - aplicar no estoque
2. Verifique nova entrada no saldo.

### 5.6 Alertas de estoque baixo
1. No `/admin/estoque`, configure `stock_min` acima do saldo.
2. Salve.
3. Confirme alerta na tela e via endpoint:
```powershell
Invoke-RestMethod http://localhost:3001/api/stock/alerts
```

## Critérios de aceite

- Entrada manual incrementa saldo.
- Conclusão do pedido baixa estoque uma única vez.
- Reversão de status cria estorno.
- Nota por foto gera entrada após revisão.
- Alertas aparecem quando `saldo <= stock_min`.

## Troubleshooting rápido

- Erro de Storage/RLS ao criar bucket/upload:
  - normalmente `SUPABASE_SERVICE_ROLE_KEY` está incorreta (ex: usando `anon`).
- `/api/stock/balance` falha:
  - migração não aplicada por completo.
- Upload da nota falha:
  - bucket não existe ou nome diferente de `SUPABASE_INVOICE_BUCKET`.
- OCR/IA falha:
  - endpoints/chaves não configurados; fluxo manual continua funcionando.

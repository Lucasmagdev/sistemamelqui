# Assistente IA Passo a Passo

Este documento descreve o que voce precisa fazer para o assistente do sistema conseguir responder perguntas sobre:

- codigo do projeto
- arquivos SQL e documentacao
- dados reais do banco em modo read-only

## 1. O que foi implementado

O endpoint `POST /api/assistant/query` agora:

- le o codigo em `src/` e `backend/src/`
- le os SQLs em `banco de dados/`
- le documentos principais em `.md`
- identifica tabelas relacionadas com a pergunta
- busca amostras reais dessas tabelas no Supabase
- monta uma resposta com fontes

Pagina usada no frontend:

- `http://localhost:8080/admin/assistente`

## 2. Variaveis de ambiente necessarias

### Frontend `.env`

Voce precisa ter:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_BACKEND_URL=http://localhost:3001
```

### Backend `backend/.env`

Voce precisa ter:

```env
PORT=3001
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGINS=http://localhost:8080
```

Opcional para respostas melhores com LLM:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-pro
```

Se `GEMINI_API_KEY` nao existir, o assistente continua funcionando, mas usa fallback local e responde de forma mais simples.

## 3. Como subir o sistema

### Frontend

Na raiz do projeto:

```bash
npm install
npm run dev
```

### Backend

Na pasta `backend/`:

```bash
npm install
npm run dev
```

## 4. Como testar

Entre em:

```txt
http://localhost:8080/admin/assistente
```

Teste perguntas como:

- `onde o backend atualiza o status do pedido?`
- `quais tabelas e colunas sao mais importantes para pedidos?`
- `me mostre as colunas de products e orders`
- `quais arquivos falam de estoque e lotes?`
- `quanto vendemos no delivery esta semana?`
- `quais tabelas parecem guardar funcionarios e pagamentos?`

## 5. Como validar que esta lendo codigo e banco

Na resposta do assistente, verifique se aparecem fontes como:

- `backend/src/index.js:...`
- `src/pages/...`
- `banco de dados/...sql`
- `orders`
- `products`
- `clients`

Se as fontes aparecerem, significa que o contexto foi recuperado corretamente.

## 6. O que ele faz hoje

- busca trechos relevantes do codigo e documentacao local
- monta um resumo de schema com base nos SQLs do repositorio
- consulta tabelas relevantes no Supabase em modo leitura
- devolve resposta com base em contexto tecnico e operacional

## 7. Limitacoes atuais

- ainda nao existe geracao de SQL livre pelo modelo
- a leitura do banco e feita por tabelas conhecidas e consultas seguras
- se uma tabela nao estiver nos SQLs ou nao existir no Supabase, ela pode nao aparecer bem no contexto
- a seguranca do backend ainda depende da sua exposicao de rede e da protecao da area admin

## 8. Recomendacoes de seguranca antes de producao

- nao exponha esse backend livremente na internet sem autenticar a rota do assistente
- mantenha `SUPABASE_SERVICE_ROLE_KEY` apenas no backend
- restrinja `CORS_ORIGINS`
- se publicar, coloque o backend atras de auth real para admin

## 9. Melhorias recomendadas na proxima fase

Se voce quiser deixar isso mais forte, o proximo passo ideal e:

1. adicionar autenticacao real no backend para a rota `/api/assistant/query`
2. salvar um indice persistente de conhecimento em vez de reindexar em memoria
3. adicionar um catalogo manual de tabelas e significados de negocio
4. adicionar consultas SQL read-only mais inteligentes, com whitelist
5. registrar historico de perguntas e respostas

## 10. Checklist rapido

1. preencher `.env` da raiz
2. preencher `backend/.env`
3. subir backend na porta `3001`
4. subir frontend na porta `8080`
5. abrir `/admin/assistente`
6. testar perguntas de codigo
7. testar perguntas de banco
8. validar as fontes mostradas

## 11. Arquivos principais desta implementacao

- `backend/src/assistant.js`
- `backend/src/index.js`
- `src/pages/AssistentePage.tsx`

## 12. Se algo nao responder

Verifique nesta ordem:

1. backend esta rodando?
2. `VITE_BACKEND_URL` aponta para o backend correto?
3. `SUPABASE_SERVICE_ROLE_KEY` esta correta no `backend/.env`?
4. a tabela existe de fato no banco?
5. o arquivo ou SQL que voce espera esta dentro deste repositorio?

Se quiser, a proxima etapa que vale mais a pena e eu implementar autenticacao real na rota do assistente e uma camada de consultas SQL read-only mais avancada.

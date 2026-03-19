# Imperial Flow Gold

Sistema web construido com React + Vite + TypeScript.

## Requisitos

- Node.js 18+
- npm

## Rodando frontend localmente

```sh
npm install
npm run dev
```

Aplicacao em `http://localhost:8080`.

Crie o arquivo `.env` local a partir de `.env.example`.

## Backend local

```sh
cd backend
npm install
npm start
```

Configure o backend a partir de `backend/.env.example`.

## Scripts frontend

- `npm run dev` inicia o servidor de desenvolvimento
- `npm run build` gera build de producao
- `npm run preview` executa preview da build
- `npm run lint` roda o ESLint
- `npm run test` executa os testes com Vitest

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

## Fluxo WhatsApp com backend

O envio WhatsApp por mudanca de status agora acontece no backend (`backend/`), integrado ao Z-API.

Tutorial completo:
- [TUTORIAL_ZAPI_BACKEND.md](./TUTORIAL_ZAPI_BACKEND.md)

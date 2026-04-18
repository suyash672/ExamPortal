# examshield monorepo

This repository contains two workspace packages:

- `backend`: Node.js + Express + TypeScript + Prisma + PostgreSQL
- `frontend`: Next.js 14 (App Router) + TypeScript + Tailwind CSS

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL

## Setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Create env files:

   - Backend:

     ```bash
     copy backend\.env.example backend\.env
     ```

   - Frontend:

     ```bash
     copy frontend\.env.local.example frontend\.env.local
     ```

3. Update values in env files (`DATABASE_URL`, JWT secrets, and frontend API URL).

## Development

Run backend:

```bash
npm run dev -w backend
```

Run frontend:

```bash
npm run dev -w frontend
```

Backend health check:

- `GET http://localhost:4000/health` returns `{ "status": "ok" }`

## Build

Build backend:

```bash
npm run build -w backend
```

Build frontend:

```bash
npm run build -w frontend
```

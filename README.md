# ExamShield

ExamShield is a full-stack exam platform with separate teacher and student flows.

- Backend: Express + TypeScript + Prisma + MongoDB
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS
- Auth: JWT access token + refresh token rotation with HTTP-only cookie

## Monorepo structure

```text
examshield/
├─ backend/
│  ├─ prisma/
│  └─ src/
└─ frontend/
  └─ src/
```

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB (replica set required for Prisma transactions)

## Environment configuration

### Backend

Copy and edit `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Required keys:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `PORT` (default `4000`)
- `FRONTEND_URL` (default frontend origin, usually `http://localhost:3000`)

### Frontend

Copy and edit `frontend/.env.local`:

```bash
cp frontend/.env.local.example frontend/.env.local
```

Required key:

- `NEXT_PUBLIC_API_URL` (usually `http://localhost:4000`)

## Install and run

From repo root:

```bash
npm install
```

Prepare database (from `backend/`):

```bash
npx prisma generate
npx prisma db push
```

Run backend:

```bash
npm run dev -w backend
```

Run frontend:

```bash
npm run dev -w frontend
```

Health check:

- `GET http://localhost:4000/health` → `{ "status": "ok" }`

## Build

```bash
npm run build -w backend
npm run build -w frontend
```

## API overview

All backend routes are mounted in `backend/src/index.ts` and exposed under `/api/*`.

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Teacher: subjects, modules, banks, questions

- `GET /api/subjects`
- `POST /api/subjects`
- `PUT /api/subjects/:id`
- `DELETE /api/subjects/:id`
- `GET /api/subjects/:subjectId/modules`
- `POST /api/subjects/:subjectId/modules`
- `PUT /api/modules/:id`
- `DELETE /api/modules/:id`
- `GET /api/modules/:moduleId/banks`
- `POST /api/modules/:moduleId/banks`
- `PUT /api/banks/:id`
- `DELETE /api/banks/:id`
- `GET /api/banks/:qbId/questions`
- `POST /api/banks/:qbId/questions`
- `PUT /api/questions/:id`
- `DELETE /api/questions/:id`
- `POST /api/questions/import-csv`

### Teacher: tests and results

- `GET /api/tests`
- `POST /api/tests`
- `GET /api/tests/:id`
- `DELETE /api/tests/:id`
- `GET /api/tests/:testId/results`
- `GET /api/tests/:testId/results/export`
- `GET /api/tests/:testId/attempts/:attemptId`

### Student

- `GET /api/student/tests`
- `POST /api/student/enroll`
- `POST /api/student/begin`
- `GET /api/student/attempt/:attemptId`
- `POST /api/student/answer`
- `POST /api/student/submit`

## Architecture

```text
           ┌──────────────────────────┐
           │      Next.js Frontend    │
           │  (teacher + student UI)  │
           └─────────────┬────────────┘
                    │ HTTP/JSON + Cookie
                    ▼
           ┌──────────────────────────┐
           │    Express API Server    │
           │ auth, validation, RBAC,  │
           │ ownership, scoring, CSV  │
           └─────────────┬────────────┘
                    │ Prisma ORM
                    ▼
           ┌──────────────────────────┐
           │       PostgreSQL DB      │
           │ users/tests/attempts/etc │
           └──────────────────────────┘
```

## Notes

- Access tokens expire in 15 minutes; refresh tokens are used for silent re-auth.
- Auth endpoints have rate limiting enabled.
- Validation is enforced via Zod middleware on write endpoints.
- Global error handling is enabled in backend middleware.

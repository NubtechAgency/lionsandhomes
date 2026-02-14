# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

### Backend (Node.js + Express + TypeScript)
```bash
cd backend
npm run dev              # Dev server with hot reload (ts-node-dev, port 8000)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JS (production)
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run migrations (dev)
npm run prisma:studio    # Open Prisma Studio GUI
```

### Frontend (React + Vite + TypeScript)
```bash
cd frontend
npm run dev      # Dev server (port 3000, proxies /api to backend:8000)
npm run build    # Type-check + Vite build
npm run lint     # ESLint check
npm run preview  # Preview production build
```

### Type checking (no build output)
```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

### Docker (production)
```bash
docker compose up --build   # Starts PostgreSQL + Backend + Frontend
```

## Architecture

**Monorepo** with two independent apps sharing no code:

```
backend/    → Express REST API (port 8000)
frontend/   → React SPA served by Nginx (port 80 in Docker, 3000 in dev)
```

### Backend

- **Entry:** `src/server.ts` — Express app, CORS, routes, health check, user seed
- **Routes:** `src/routes/` — 6 modules: auth, projects, transactions, dashboard, sync, invoices
- **Controllers:** `src/controllers/` — Business logic per route module
- **Middleware:** `src/middleware/auth.ts` (JWT), `src/middleware/n8nAuth.ts` (webhook token)
- **Services:** `src/services/cloudflare-r2.ts` — S3-compatible upload/download with signed URLs
- **Database:** Prisma ORM with PostgreSQL (prod) / SQLite (dev)
- **Models:** User, Project, Transaction (see `prisma/schema.prisma`)

### Frontend

- **Entry:** `src/main.tsx` → `src/App.tsx` (React Router)
- **Pages:** `src/pages/` — Dashboard, Transactions, Projects, ProjectDetail, ProjectForm, Invoices, Login, General
- **Components:** `src/components/` — Navbar, KPICard, TransactionEditModal, ProjectCard, charts/
- **State:** React Context for auth (`src/contexts/AuthContext.tsx`), local state elsewhere
- **API Client:** `src/services/api.ts` — centralized fetch wrapper with JWT injection
- **Types:** `src/types/index.ts` — all shared TypeScript interfaces
- **Constants:** `src/lib/constants.ts` — EXPENSE_CATEGORIES, PROJECT_CATEGORIES
- **Styling:** Tailwind CSS with amber as primary color

### Key Patterns

- **Transaction sync:** n8n sends bank transactions via `POST /api/sync/transactions`. Uses Prisma `upsert` on `externalId` to prevent duplicates. Manual assignments (projectId, expenseCategory, notes) are NOT overwritten on sync updates.
- **Invoice upload:** 3-step flow — get signed URL from backend → PUT file to R2 → PATCH to attach invoice to transaction.
- **Modal pattern:** Modals receive `onSave` callback, don't call APIs directly.
- **Inline editing:** Transaction table has inline selects for project/category that auto-save via PATCH.
- **Soft delete:** Transactions are never deleted, only archived (`isArchived` flag).

## Database

- **Provider:** PostgreSQL in production, can use SQLite for local dev
- **ORM:** Prisma — schema at `backend/prisma/schema.prisma`
- **Critical constraint:** `externalId @unique` on Transaction prevents sync duplicates
- **SQLite caveat:** Do NOT use `mode: 'insensitive'` in Prisma filters — incompatible with SQLite. PostgreSQL supports it.

## Deployment

- **Platform:** Docker + Dockploy on Hostinger VPS, Traefik reverse proxy
- **Docker:** Multi-stage builds for both apps. Backend runs `prisma migrate deploy` on startup.
- **Network:** Containers must be on `dokploy-network` (external) for Traefik routing.
- **Domains:** `lionsandhomes.nubtechagency.com` (frontend), `api-lionsandhomes.nubtechagency.com` (backend)
- **Alpine + Prisma:** Both Docker stages need `apk add --no-cache openssl` for Prisma to work.

## Environment Variables

**Backend:** DATABASE_URL, PORT, JWT_SECRET, FRONTEND_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, N8N_SYNC_TOKEN

**Frontend:** VITE_API_URL (build-time, injected via Docker ARG)

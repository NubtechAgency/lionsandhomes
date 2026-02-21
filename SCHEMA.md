# ESQUEMA COMPLETO — Lions & Homes

**Sistema de control de gastos para proyectos de remodelacion inmobiliaria**
Desarrollado por NUBTECH AGENCY para cliente Lions
Ultima actualizacion: 2026-02-21

---

## 1. ARQUITECTURA GENERAL

```
Internet
  │
  ├── lionsandhomes.nubtechagency.com ──→ Traefik ──→ Frontend (Nginx:80 → 3002 host)
  │
  └── api-lionsandhomes.nubtechagency.com ──→ Traefik ──→ Backend (Express:8000)
                                                              │
                                                    PostgreSQL 15 (5432, interno)
                                                              │
                                                    Cloudflare R2 (facturas)
                                                              │
                                                    n8n (sync bancario webhook)
```

**Dev local:**
- Frontend: `localhost:3000` (Vite dev, proxy `/api` → `localhost:8000`)
- Backend: `localhost:8000` (ts-node-dev hot reload)
- DB: SQLite (`backend/prisma/dev.db`)

---

## 2. ESTRUCTURA DE ARCHIVOS (COMPLETA)

```
Lions&Homes/
├── docker-compose.yml              # 3 servicios: postgres, backend, frontend
├── .env.example                    # Template variables entorno
├── .gitignore                      # node_modules, .env, dist, dev.db, .claude/
├── CLAUDE.md                       # Instrucciones para Claude Code
├── TASKS.md                        # Plan proxima fase (bulk OCR invoices)
├── README.md                       # Documentacion del proyecto
├── SCHEMA.md                       # ESTE ARCHIVO
│
├── .claude/                        # (gitignored) Config local Claude
│   ├── settings.local.json         # Permisos de herramientas
│   ├── commands/gitcontrol.md      # Slash command /gitcontrol
│   ├── agents/logic-guard.md       # Agente logic-guard
│   └── agent-memory/logic-guard/MEMORY.md
│
├── backend/
│   ├── Dockerfile                  # Multi-stage: node:20-alpine → production
│   ├── .dockerignore               # node_modules, dist, .env, .git
│   ├── package.json                # 13 deps + 10 devDeps
│   ├── package-lock.json
│   ├── tsconfig.json               # ES2022, strict, commonjs
│   ├── .env                        # (gitignored) Secrets locales
│   │
│   ├── prisma/
│   │   ├── schema.prisma           # 7 modelos
│   │   ├── dev.db                  # (gitignored) SQLite local
│   │   └── migrations/             # 5 migraciones SQL
│   │       ├── 20260214000000_init_postgresql/
│   │       ├── 20260214183600_add_isFixed_to_transaction/
│   │       ├── 20260215000000_multi_invoice/
│   │       ├── 20260216000000_add_transaction_project_allocations/
│   │       └── 20260221000000_add_refresh_token_and_audit_log/
│   │
│   ├── scripts/
│   │   ├── check-duplicates.mjs    # Verificar duplicados en produccion
│   │   └── change-password.ts      # (sin trackear) Cambiar password
│   │
│   └── src/
│       ├── server.ts               # Entry point: middlewares, rutas, seeds, cleanup
│       │
│       ├── routes/
│       │   ├── auth.ts             # 4 endpoints: login, refresh, logout, me
│       │   ├── projects.ts         # 5 endpoints: CRUD + list
│       │   ├── transactions.ts     # 6 endpoints: CRUD + archive + check-duplicates
│       │   ├── dashboard.ts        # 1 endpoint: stats
│       │   ├── sync.ts             # 2 endpoints: sync transactions + status
│       │   └── invoices.ts         # 3 endpoints: upload, get URLs, delete
│       │
│       ├── controllers/
│       │   ├── authController.ts         # Login/refresh/logout/me (httpOnly cookies)
│       │   ├── projectController.ts      # CRUD proyectos + stats
│       │   ├── transactionController.ts  # CRUD tx + auto-sync + allocations
│       │   ├── dashboardController.ts    # KPIs + alertas presupuesto
│       │   ├── syncController.ts         # Upsert n8n + status
│       │   └── invoiceController.ts      # Upload R2 + magic bytes + signed URLs
│       │
│       ├── middleware/
│       │   ├── auth.ts             # JWT desde cookie httpOnly (fallback header)
│       │   ├── n8nAuth.ts          # Token X-N8N-Token (timingSafeEqual)
│       │   └── validate.ts         # Factory: Zod schema → validate(schema, target)
│       │
│       ├── schemas/
│       │   ├── auth.schemas.ts           # loginSchema
│       │   ├── project.schemas.ts        # create/update/listQuery
│       │   ├── transaction.schemas.ts    # create/update/listQuery/idParam
│       │   ├── dashboard.schemas.ts      # dashboardQuery
│       │   ├── sync.schemas.ts           # syncTransactions
│       │   └── invoice.schemas.ts        # invoiceParam/invoiceIdParam
│       │
│       ├── services/
│       │   ├── auditLog.ts         # logAudit() + getClientIp() (nunca crashea)
│       │   └── cloudflare-r2.ts    # upload/download/delete + signed URLs + key gen
│       │
│       └── lib/
│           ├── constants.ts        # EXPENSE_CATEGORIES, INVOICE_EXEMPT, PROJECT_STATUSES
│           └── cookies.ts          # Cookie config: access(15m), refresh(7d), legacy clear
│
└── frontend/
    ├── Dockerfile                  # Multi-stage: node:20-alpine → nginx:alpine
    ├── .dockerignore               # node_modules, dist, .env, .git
    ├── nginx.conf                  # SPA routing, gzip, cache 1y, security headers, CSP
    ├── package.json                # 9 deps + 13 devDeps
    ├── package-lock.json
    ├── tsconfig.json               # ES2020, strict, ESNext modules
    ├── tsconfig.node.json
    ├── vite.config.ts              # Port 3000, proxy /api, alias @/
    ├── tailwind.config.js          # Amber primary
    ├── postcss.config.js
    ├── index.html                  # SPA entry
    │
    └── src/
        ├── main.tsx                # ReactDOM.createRoot + StrictMode
        ├── App.tsx                 # BrowserRouter + AuthProvider + Routes (9 rutas)
        ├── vite-env.d.ts           # Vite types
        ├── index.css               # Tailwind layers + custom scrollbar
        │
        ├── contexts/
        │   └── AuthContext.tsx      # Auth state + direct fetch session check
        │
        ├── services/
        │   └── api.ts              # fetchAPI + refresh interceptor + 5 API modules
        │
        ├── types/
        │   └── index.ts            # 20+ interfaces/types
        │
        ├── lib/
        │   ├── constants.ts        # EXPENSE_CATEGORIES (8), PROJECT_CATEGORIES (5)
        │   └── formatters.ts       # formatCurrency, formatDate, formatPercentage...
        │
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx
        │   ├── General.tsx
        │   ├── Projects.tsx
        │   ├── ProjectDetail.tsx
        │   ├── ProjectForm.tsx
        │   ├── Transactions.tsx
        │   └── Invoices.tsx
        │
        └── components/
            ├── Navbar.tsx
            ├── KPICard.tsx
            ├── ProjectCard.tsx
            ├── TransactionEditModal.tsx
            ├── CategoryProgressList.tsx
            └── charts/
                ├── DonutChart.tsx
                └── ExpenseBarChart.tsx
```

---

## 3. BASE DE DATOS — 7 MODELOS

**Prisma:** `backend/prisma/schema.prisma`
**Produccion:** PostgreSQL 15 | **Dev local:** SQLite

### 3.1 User
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| email | String | **UNIQUE** |
| password | String | bcrypt hash |
| name | String | |
| createdAt | DateTime | default(now()) |
| updatedAt | DateTime | @updatedAt |
| refreshTokens | RefreshToken[] | 1:N cascade |

### 3.2 RefreshToken
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| token | String | **UNIQUE**, crypto.randomBytes(40) |
| userId | Int | FK → User (CASCADE) |
| expiresAt | DateTime | 7 dias desde creacion |
| createdAt | DateTime | default(now()) |

**Indexes:** token, userId, expiresAt

### 3.3 Project
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| name | String | "Apartamento Gran Via 45" |
| description | String? | |
| status | String | default("ACTIVE") → ACTIVE/COMPLETED/ARCHIVED |
| totalBudget | Float | >= 0 |
| categoryBudgets | String | JSON string: `{"MATERIAL_Y_MANO_DE_OBRA": 5000, ...}` |
| startDate | DateTime | |
| endDate | DateTime? | |
| createdAt | DateTime | default(now()) |
| updatedAt | DateTime | @updatedAt |
| transactions | Transaction[] | 1:N (denormalizado via projectId) |
| allocations | TransactionProject[] | 1:N (normalizado) |

**Index:** status
**Proyecto especial:** "General" — se crea en seed, gastos no asignados

### 3.4 Transaction
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| externalId | String? | **UNIQUE** — ID del banco via n8n, null si manual |
| isManual | Boolean | default(false) — true = creada por usuario |
| date | DateTime | |
| amount | Float | **Negativo = gasto**, positivo = ingreso |
| concept | String | Descripcion del movimiento |
| category | String | default("Uncategorized") — categoria raw del banco |
| projectId | Int? | FK → Project (denormalizado de allocations) |
| expenseCategory | String? | Categoria Lions asignada por usuario |
| notes | String? | |
| hasInvoice | Boolean | default(false) — tiene facturas adjuntas |
| isArchived | Boolean | default(false) — soft delete |
| isFixed | Boolean | default(false) — gasto fijo vs variable |
| createdAt | DateTime | default(now()) |
| updatedAt | DateTime | @updatedAt |
| project | Project? | FK relacion |
| allocations | TransactionProject[] | 1:N |
| invoices | Invoice[] | 1:N |

**Indexes:** externalId (unique), projectId, expenseCategory, hasInvoice, date, isManual, isArchived, isFixed

### 3.5 TransactionProject (tabla pivot multi-proyecto)
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| transactionId | Int | FK → Transaction (CASCADE) |
| projectId | Int | FK → Project |
| amount | Float | Importe asignado (mismo signo que tx) |
| createdAt | DateTime | default(now()) |

**Unique constraint:** (transactionId, projectId)
**Indexes:** transactionId, projectId

### 3.6 Invoice
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| transactionId | Int | FK → Transaction |
| url | String | Key en R2: `invoices/{txId}-{timestamp}-{filename}` |
| fileName | String | Nombre original del archivo |
| createdAt | DateTime | default(now()) |

**Index:** transactionId

### 3.7 AuditLog
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | Int | PK, autoincrement |
| action | String | LOGIN/LOGIN_FAILED/LOGOUT/REFRESH/CREATE/UPDATE/DELETE/ARCHIVE/UNARCHIVE/UPLOAD/DOWNLOAD/SYNC |
| entityType | String? | Transaction/Project/Invoice/User |
| entityId | Int? | |
| userId | Int? | |
| details | String? | JSON string |
| ipAddress | String? | x-forwarded-for o req.ip |
| createdAt | DateTime | default(now()) |

**Indexes:** action, userId, createdAt

### 3.8 Migraciones (5)
| # | Nombre | Que hace |
|---|--------|----------|
| 1 | `init_postgresql` | User, Project, Transaction (con invoiceUrl/invoiceFileName inline), indexes, FK |
| 2 | `add_isFixed_to_transaction` | Campo isFixed + index |
| 3 | `multi_invoice` | Tabla Invoice, migra datos, DROP invoiceUrl/invoiceFileName |
| 4 | `add_transaction_project_allocations` | Tabla TransactionProject, migra projectId existentes |
| 5 | `add_refresh_token_and_audit_log` | Tablas RefreshToken + AuditLog (IF NOT EXISTS, safety) |

---

## 4. BACKEND — 21 API ENDPOINTS

### 4.1 Auth (`/api/auth`) — No requiere JWT (excepto /me)
| Metodo | Ruta | Rate Limit | Middleware | Descripcion |
|--------|------|-----------|------------|-------------|
| POST | /login | 5/15min | validate(loginSchema) | Login → cookies httpOnly (access 15m + refresh 7d) |
| POST | /refresh | 10/1min | — | Rotar refresh token → nuevas cookies |
| POST | /logout | — | — | Invalidar refresh + limpiar cookies |
| GET | /me | — | authMiddleware | Datos del usuario actual |

**Flujo login:**
1. Valida email/password con bcrypt
2. Genera accessToken JWT (15min) + refreshToken crypto (7d)
3. Guarda refresh en DB, limpia tokens viejos (max 5 por user)
4. Limpia cookies legacy (domain amplio → host-only)
5. Setea httpOnly cookies (sin domain = host-only)
6. Responde con `{user}` (sin token en body)

**Flujo refresh:**
1. Lee refresh_token de cookie
2. Busca en DB, verifica no expirado
3. Rota: elimina viejo, crea nuevo con 7d mas
4. Nuevo access token JWT
5. Setea nuevas cookies

### 4.2 Projects (`/api/projects`) — Requiere JWT
| Metodo | Ruta | Middleware | Descripcion |
|--------|------|-----------|-------------|
| GET | / | validate(listProjectsQuery, 'query') | Listar + filtro status + totalSpent desde allocations |
| GET | /:id | validate(idParam, 'params') | Detalle + stats (spent, %budget, sin factura) |
| POST | / | validate(createProjectSchema) | Crear con categoryBudgets JSON |
| PATCH | /:id | validate(idParam) + validate(updateProject) | Actualizar campos parciales |
| DELETE | /:id | validate(idParam) | Solo si NO tiene allocations |

**Logica clave:**
- `totalSpent` calculado desde TransactionProject allocations (solo amount < 0)
- `categoryBudgets` almacenado como JSON string, parseado en respuesta
- Delete bloqueado si hay allocations → sugiere archivar

### 4.3 Transactions (`/api/transactions`) — Requiere JWT
| Metodo | Ruta | Middleware | Descripcion |
|--------|------|-----------|-------------|
| POST | / | validate(createTransaction) | Crear manual + auto-sync categoria por concepto |
| GET | / | validate(listTransactionsQuery, 'query') | 16 filtros + paginacion + stats agregados |
| GET | /check-duplicates | — (5/1min limiter) | Buscar duplicados por externalId y fecha+importe |
| GET | /:id | validate(idParam) | Detalle con allocations + invoices |
| PATCH | /:id | validate(idParam) + validate(updateTransaction) | Actualizar + auto-sync por concepto (max 500) |
| PATCH | /:id/archive | validate(idParam) | Toggle soft delete |

**16 filtros de listTransactions:**
projectId, expenseCategory, hasInvoice, dateFrom, dateTo, isManual, isArchived, isFixed, search, amountMin, amountMax, amountType (expense/income), sortBy, sortOrder, limit, offset

**Auto-sync por concepto:**
- Al asignar categoria/isFixed, propaga a TODAS las tx con mismo concepto
- Limite de seguridad: max 500 tx afectadas
- Permite categorizar en bulk: "AMAZON" → todas se categorizan igual

**Multi-proyecto (allocations):**
- Valida: suma allocations ≈ transaction.amount (tolerancia 0.01)
- Reemplazo atomico: deleteMany + createMany en $transaction
- Denormalize: projectId = primer allocation

### 4.4 Dashboard (`/api/dashboard`) — Requiere JWT
| Metodo | Ruta | Rate Limit | Descripcion |
|--------|------|-----------|-------------|
| GET | /stats | 10/1min | KPIs + categoryStats + recentTx + budgetAlerts |

**Respuesta:**
```json
{
  "kpis": {
    "totalActiveProjects": 5,
    "totalSpentThisMonth": 12500.50,
    "totalWithoutInvoice": 23,
    "totalWithoutProject": 8,
    "totalBudget": 150000,
    "totalSpent": 87500,
    "totalBudgetPercentage": 58.33
  },
  "categoryStats": [
    { "category": "MATERIAL_Y_MANO_DE_OBRA", "budget": 50000, "spent": 32000, "percentage": 64 }
  ],
  "recentTransactions": [...],
  "budgetAlerts": [
    { "projectId": 3, "projectName": "Piso Barcelona", "category": null, "budget": 30000, "spent": 35000, "percentage": 117 }
  ]
}
```

- Excluye proyecto "General" de conteos y presupuestos
- Categorias exentas de factura: SUELDOS, PRESTAMOS
- Soporta filtro por projectId (query param)

### 4.5 Sync n8n (`/api/sync`) — Requiere N8N_SYNC_TOKEN
| Metodo | Ruta | Rate Limit | Descripcion |
|--------|------|-----------|-------------|
| POST | /transactions | 5/1min | Upsert por externalId — NO sobreescribe manual |
| GET | /status | — | Conteos total/synced/manual |

**CRITICO — Sync NUNCA sobreescribe:**
- projectId, expenseCategory, notes, isFixed, hasInvoice
- Solo actualiza: date, amount, concept, category (del banco)
- Cada tx individual en try/catch — error en una no para el batch

### 4.6 Invoices (`/api/invoices`) — Requiere JWT
| Metodo | Ruta | Rate Limit | Descripcion |
|--------|------|-----------|-------------|
| POST | /upload | 10/1min | Multer (10MB, memory) → magic bytes → R2 → DB atomico |
| GET | /:transactionId | — | URLs firmadas de descarga (1h expiry) |
| DELETE | /:invoiceId | — | Eliminar de DB + R2 (best-effort) |

**Flujo upload:**
1. Multer valida MIME (PDF/JPG/PNG/WebP) y tamano (10MB)
2. Backend valida magic bytes (previene MIME spoofing)
3. Upload a R2 con key `invoices/{txId}-{timestamp}-{sanitizedName}`
4. DB atomica: crear Invoice + hasInvoice = true
5. Si DB falla → cleanup archivo en R2

**Flujo delete:**
1. DB atomica: eliminar Invoice + recalcular hasInvoice
2. Best-effort: borrar archivo de R2

---

## 5. BACKEND — MIDDLEWARE CHAIN (orden en server.ts)

```
1. helmet()                              → Security headers
2. cookieParser()                        → Leer cookies httpOnly
3. cors({ origin, credentials })         → CORS (produccion: FRONTEND_URL, dev: localhost:3000/3001/3003)
4. globalLimiter (500/15min)             → Rate limit global (SKIP auth routes)
5. express.json({ limit: '1mb' })        → Body parser
6. express.urlencoded({ limit: '1mb' })  → Form parser
7. [endpoint-specific limiters]          → login(5/15m), refresh(10/1m), dashboard(10/1m), etc.
8. [routes]                              → validate(schema) → [auth/n8n middleware] → controller
```

**Rate limiters especificos:**
| Endpoint | Max | Ventana |
|----------|-----|---------|
| /api/auth/login | 5 | 15 min |
| /api/auth/refresh | 10 | 1 min |
| /api/dashboard/stats | 10 | 1 min |
| /api/transactions/check-duplicates | 5 | 1 min |
| /api/invoices/upload | 10 | 1 min |
| /api/sync/transactions | 5 | 1 min |
| Global (resto) | 500 | 15 min |

---

## 6. BACKEND — SERVICIOS

### 6.1 Cloudflare R2 (`services/cloudflare-r2.ts`)
- Cliente S3 compatible (endpoint: `{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
- Bucket: `lions-invoices-production` (configurable via R2_BUCKET_NAME)
- **uploadFileToR2(key, buffer, contentType)** — Upload directo
- **generateDownloadUrl(key, 3600)** — URL firmada GET (1h)
- **deleteFile(key)** — Eliminar objeto
- **generateInvoiceKey(txId, fileName)** → `invoices/{txId}-{timestamp}-{sanitized}`

### 6.2 Audit Log (`services/auditLog.ts`)
- **logAudit(entry)** — Inserta en AuditLog, envuelto en try/catch (NUNCA crashea)
- **getClientIp(req)** — Extrae IP de x-forwarded-for (Traefik) o req.ip
- Usado en: auth, transactions, projects, invoices, sync

---

## 7. BACKEND — SCHEMAS ZOD (validacion)

### auth.schemas.ts
- `loginSchema`: email (string min 1), password (string min 1)

### project.schemas.ts
- `createProjectSchema`: name (1-200), description? (max 1000), status? (enum), totalBudget? (>=0), categoryBudgets? (record o string), startDate?, endDate?
- `updateProjectSchema`: todos opcionales
- `listProjectsQuerySchema`: status? (enum)

### transaction.schemas.ts
- `createTransactionSchema`: date (string), amount (number), concept (1-500), projectId?, allocations? [{projectId, amount}], expenseCategory? (enum 8 valores), notes? (max 1000), isFixed?
- `updateTransactionSchema`: todos opcionales
- `listTransactionsQuerySchema`: 16 campos query string
- `idParamSchema`: id (regex digitos)

### dashboard.schemas.ts
- `dashboardQuerySchema`: projectId? (regex digitos)

### sync.schemas.ts
- `syncTransactionsSchema`: transactions array de {externalId, date, amount, concept, category?}

### invoice.schemas.ts
- `invoiceParamSchema`: transactionId (regex digitos)
- `invoiceIdParamSchema`: invoiceId (regex digitos)

---

## 8. BACKEND — STARTUP (server.ts)

Al arrancar el servidor:
1. Valida env vars requeridas: JWT_SECRET, DATABASE_URL
2. En produccion: valida JWT_SECRET >= 32 chars
3. Monta middlewares y rutas
4. **seedDefaultUser()**: si SEED_USER_EMAIL + SEED_USER_PASSWORD existen, crea o actualiza password
5. **seedGeneralProject()**: crea proyecto "General" si no existe
6. **setInterval (1h)**: limpia refresh tokens expirados de la DB

---

## 9. FRONTEND — ROUTING (App.tsx)

| Ruta | Pagina | Acceso |
|------|--------|--------|
| `/login` | Login | PublicRoute (redirige a /dashboard si autenticado) |
| `/dashboard` | Dashboard | ProtectedRoute |
| `/general` | General | ProtectedRoute |
| `/projects` | Projects | ProtectedRoute |
| `/projects/new` | ProjectForm (crear) | ProtectedRoute |
| `/projects/:id` | ProjectDetail | ProtectedRoute |
| `/projects/:id/edit` | ProjectForm (editar) | ProtectedRoute |
| `/transactions` | Transactions | ProtectedRoute |
| `/invoices` | Invoices | ProtectedRoute |
| `/` | → redirect /dashboard | |
| `*` | 404 page | |

---

## 10. FRONTEND — AUTH FLOW (AuthContext.tsx + api.ts)

### Inicio de app
```
App monta → AuthProvider useEffect:
  1. fetch('/api/auth/me') DIRECTO (sin interceptor)
  2. Si 401 → fetch('/api/auth/refresh') UNA vez
  3. Si refresh ok → fetch('/api/auth/me') de nuevo
  4. Si ok → setUser(data.user)
  5. Si falla → setUser(null) → ProtectedRoute redirige a /login
```

### Durante sesion activa (fetchAPI interceptor)
```
  1. Request 401 (access expirado) → attemptRefresh() automatico
  2. Deduplicacion: singleton promise para refreshes concurrentes
  3. Si refresh ok → reintenta request original
  4. Si refresh falla → sessionExpired=true → dispatch event → setUser(null)
  5. Flag sessionExpired previene mas intentos hasta proximo login
```

### Login
```
  1. authAPI.login(credentials) via fetchAPI
  2. Server setea cookies httpOnly
  3. resetSessionExpired()
  4. setUser(response.user) → navigate('/dashboard')
```

### Logout
```
  1. authAPI.logout() → server borra cookie + DB
  2. setUser(null) → ProtectedRoute → /login
```

---

## 11. FRONTEND — API CLIENT (services/api.ts)

**5 modulos exportados:**

### authAPI
- `login(credentials)` → POST /api/auth/login
- `getCurrentUser()` → GET /api/auth/me
- `refresh()` → POST /api/auth/refresh
- `logout()` → POST /api/auth/logout

### projectAPI
- `listProjects(status?)` → GET /api/projects(?status=)
- `getProject(id)` → GET /api/projects/:id
- `createProject(data)` → POST /api/projects
- `updateProject(id, data)` → PATCH /api/projects/:id
- `deleteProject(id)` → DELETE /api/projects/:id

### transactionAPI
- `createTransaction(data)` → POST /api/transactions
- `listTransactions(filters?, limit, offset)` → GET /api/transactions?...
- `getTransaction(id)` → GET /api/transactions/:id
- `updateTransaction(id, data)` → PATCH /api/transactions/:id
- `archiveTransaction(id)` → PATCH /api/transactions/:id/archive

### dashboardAPI
- `getStats(projectId?)` → GET /api/dashboard/stats(?projectId=)

### invoiceAPI
- `uploadInvoice(txId, file)` → POST /api/invoices/upload (FormData, sin JSON header)
- `getInvoiceUrls(txId)` → GET /api/invoices/:transactionId
- `deleteInvoice(invoiceId)` → DELETE /api/invoices/:invoiceId

---

## 12. FRONTEND — PAGINAS (detalle)

### Login.tsx
- Form email/password → authAPI.login() → navigate('/dashboard')
- Sin API calls al montar

### Dashboard.tsx
- **API calls:** projectAPI.listProjects('ACTIVE'), dashboardAPI.getStats(), transactionAPI.listTransactions()
- **KPIs:** Proyectos activos, Gasto mes actual, Sin factura, Sin proyecto
- **Charts:** ExpenseBarChart (evolucion temporal fijo/variable)
- **Lista:** Proyectos activos con barras presupuesto

### General.tsx
- **API calls:** dashboardAPI.getStats(), transactionAPI.listTransactions(5000)
- **KPIs:** Presupuesto total, Gastado total, Disponible
- **Charts:** DonutChart por categoria (solo budget > 0)
- **Alertas:** Proyectos/categorias que exceden presupuesto
- **Tabla:** Desglose gastos fijos por categoria con progress bars

### Projects.tsx
- **API calls:** projectAPI.listProjects(), dashboardAPI.getStats()
- Filtro status (ALL/ACTIVE/COMPLETED/ARCHIVED) + busqueda
- Grid de ProjectCards con barra presupuesto

### ProjectDetail.tsx
- **API calls:** projectAPI.getProject(id), transactionAPI.listTransactions({projectId})
- **3 tabs:** General (KPIs + donuts + categorias) | Transacciones (tabla ordenable) | Calendario (placeholder)
- Alertas presupuestarias, desglose por categoria

### ProjectForm.tsx
- Modo dual: crear o editar (detecta :id en URL)
- Form: nombre, status, presupuesto total, presupuestos por categoria
- Valida suma categorias no exceda total

### Transactions.tsx
- **API calls:** projectAPI.listProjects(), transactionAPI.listTransactions(filters)
- **Tabs:** Gastos / Ingresos
- **16 filtros:** proyecto, categoria, factura, fecha, manual/banco, archivado, fijo/variable, busqueda, rango importe, ordenacion
- **Edicion inline:** proyecto, categoria, factura (upload directo), fijo/variable
- **Modal:** TransactionEditModal para edicion completa + allocations
- **Crear:** Modal de creacion manual
- **Paginacion:** 50/100/all

### Invoices.tsx
- **API calls:** projectAPI.listProjects(), transactionAPI.listTransactions({hasInvoice: true})
- Galeria de transacciones con factura
- Filtro por proyecto + busqueda

---

## 13. FRONTEND — COMPONENTES

| Componente | Proposito |
|------------|-----------|
| **Navbar.tsx** | Navegacion top + logout, links a todas las paginas |
| **KPICard.tsx** | Tarjeta metrica (titulo, valor, icono, color, optional trend) |
| **ProjectCard.tsx** | Card proyecto con nombre, status, barra presupuesto, tx count |
| **TransactionEditModal.tsx** | Editor completo: allocations multi-proyecto, categoria, notas, facturas, upload/delete |
| **CategoryProgressList.tsx** | Progress bars por categoria con budget vs spent |
| **DonutChart.tsx** | Recharts PieChart — presupuesto vs gastado por categoria |
| **ExpenseBarChart.tsx** | Recharts AreaChart — evolucion temporal gastos fijos/variables |

---

## 14. FRONTEND — TYPES (types/index.ts)

```typescript
// Auth
User, LoginCredentials, AuthResponse, ApiError

// Projects
ExpenseCategory (8 valores), ProjectStatus (3 valores), CategoryBudgets
Project, ProjectStats, ProjectWithStats, CreateProjectData, UpdateProjectData

// Transactions
Invoice, TransactionAllocation, Transaction
TransactionFilters (16 campos), UpdateTransactionData, CreateTransactionData, TransactionPagination

// Dashboard
CategoryStat, DashboardKPIs, BudgetAlert, DashboardStats
```

---

## 15. CATEGORIAS DE GASTO

| Key | Label | Exenta factura | En presupuesto proyecto |
|-----|-------|---------------|------------------------|
| MATERIAL_Y_MANO_DE_OBRA | Material y mano de obra | No | Si |
| DECORACION | Decoracion | No | Si |
| COMPRA_Y_GASTOS | Compra y gastos de compra | No | Si |
| OTROS | Otros | No | Si |
| GASTOS_PISOS | Gastos pisos | No | Si |
| BUROCRACIA | Burocracia | No | No (global) |
| SUELDOS | Sueldos | **Si** | No (global) |
| PRESTAMOS | Prestamos | **Si** | No (global) |

---

## 16. DESPLIEGUE

### Docker Compose — 3 servicios
| Servicio | Imagen | Puerto | Red |
|----------|--------|--------|-----|
| lions-postgres | postgres:15-alpine | 5432 (interno) | lions-network |
| lions-backend | ./backend (node:20-alpine) | 8000 | lions-network + dokploy-network |
| lions-frontend | ./frontend (nginx:alpine) | 3002:80 | lions-network + dokploy-network |

### Pipeline: Git Push → Produccion
```
git push origin main
  → Dockploy detecta cambio → rebuild
  → Docker multi-stage build (backend + frontend)
  → Backend CMD: "prisma migrate deploy && node dist/server.js"
  → Frontend: Vite build → Nginx sirve SPA
```

### Backend Dockerfile
1. Stage builder: node:20-alpine + openssl + npm ci + prisma generate + tsc build
2. Stage production: node:20-alpine + openssl + npm ci --only=production + copy dist + .prisma
3. Non-root user: nodejs:1001
4. CMD: `prisma migrate deploy && node dist/server.js`

### Frontend Dockerfile
1. Stage builder: node:20-alpine + npm ci + ARG VITE_API_URL + npm run build
2. Stage production: nginx:alpine + copy dist + copy nginx.conf
3. Non-root user: nginx
4. CMD: `nginx -g "daemon off;"`

### Nginx (frontend)
- SPA routing: try_files → /index.html
- Gzip: on (text, css, xml, json, js)
- Cache: assets estaticos 1 year immutable
- Security headers: X-Frame-Options, X-Content-Type-Options, HSTS, CSP, Permissions-Policy
- CSP: connect-src incluye api-lionsandhomes.nubtechagency.com

---

## 17. VARIABLES DE ENTORNO

### Backend (produccion)
| Variable | Requerida | Default | Descripcion |
|----------|----------|---------|-------------|
| DATABASE_URL | Si | — | `postgresql://user:pass@postgres:5432/db` |
| JWT_SECRET | Si | — | Min 32 chars en produccion |
| PORT | No | 8000 | Puerto del servidor |
| NODE_ENV | No | development | production/development |
| FRONTEND_URL | No | https://lionsandhomes.nubtechagency.com | CORS origin |
| R2_ACCOUNT_ID | Si | — | Cloudflare account |
| R2_ACCESS_KEY_ID | Si | — | R2 credentials |
| R2_SECRET_ACCESS_KEY | Si | — | R2 credentials |
| R2_BUCKET_NAME | No | lions-invoices-production | Bucket name |
| R2_PUBLIC_URL | No | — | URL publica R2 |
| N8N_SYNC_TOKEN | Si | — | Token para webhook n8n |
| SEED_USER_EMAIL | No | — | Email usuario seed |
| SEED_USER_PASSWORD | No | — | Password usuario seed |
| SEED_USER_NAME | No | Lions Admin | Nombre usuario seed |

### Frontend (build-time)
| Variable | Requerida | Default | Descripcion |
|----------|----------|---------|-------------|
| VITE_API_URL | Si (prod) | '' (dev) | URL del backend API |

---

## 18. SEGURIDAD

| Capa | Implementacion |
|------|---------------|
| **Autenticacion** | JWT access (15min) en httpOnly cookie + refresh token (7d) en DB con rotacion |
| **Cookies** | httpOnly, secure, sameSite:lax, host-only (sin domain amplio) |
| **CORS** | Solo FRONTEND_URL permitido (produccion) |
| **Rate limiting** | Global 500/15min + especificos por endpoint (login 5/15min, etc.) |
| **Validacion** | Zod en todos los endpoints (body, query, params) |
| **Archivos** | Multer 10MB + MIME filter + magic bytes validation (PDF/JPG/PNG/WebP) |
| **Sync n8n** | Token via header X-N8N-Token + timingSafeEqual |
| **Audit** | Todas las acciones criticas loggeadas en AuditLog |
| **Nginx** | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, server_tokens off |
| **Docker** | Non-root users (nodejs:1001, nginx) |
| **Passwords** | bcrypt hash (cost 10) |
| **JWT** | Validacion JWT_SECRET >= 32 chars en produccion |
| **Legacy cleanup** | Limpia cookies con domain amplio durante migracion |
| **Refresh cleanup** | Max 5 refresh tokens por usuario, limpieza horaria de expirados |

---

## 19. PATRONES DE NEGOCIO CLAVE

### Sync bancario (n8n → app)
- n8n POST /api/sync/transactions con array de movimientos
- Upsert por externalId → anti-duplicados
- **NUNCA** sobreescribe: projectId, expenseCategory, notes, isFixed
- Solo actualiza: date, amount, concept, category

### Auto-sync por concepto
- Al categorizar una tx, propaga a TODAS con mismo concepto
- Limite: max 500 tx afectadas (previene corrupcion masiva)
- Permite bulk: "LEROY MERLIN" → todas se categorizan igual

### Multi-proyecto (allocations)
- 1 tx puede repartirse entre N proyectos via TransactionProject
- Validacion: suma allocations ≈ amount (tolerancia 0.01)
- Reemplazo atomico: deleteMany + createMany en $transaction
- projectId denormalizado para queries rapidos

### Soft delete
- Transacciones NUNCA se borran, solo isArchived = true
- Toggle bidireccional (archivar/desarchivar)

### Facturas multiples
- 1 tx puede tener N facturas
- Upload: multer → magic bytes → R2 → DB atomico
- Download: URLs firmadas 1h expiry
- Delete: DB atomico → R2 best-effort
- Categorias exentas: SUELDOS, PRESTAMOS

### Proyecto "General"
- Creado en seed si no existe
- Para gastos no asignados (sueldos, prestamos)
- Excluido de dashboard KPIs y conteos de proyectos

---

## 20. DEPENDENCIAS

### Backend (13 runtime + 10 dev)
| Paquete | Version | Uso |
|---------|---------|-----|
| express | ^4.21.2 | Web framework |
| @prisma/client | ^5.22.0 | ORM |
| bcrypt | ^5.1.1 | Hash passwords |
| jsonwebtoken | ^9.0.2 | JWT access tokens |
| cookie-parser | ^1.4.7 | Leer cookies |
| helmet | ^8.1.0 | Security headers |
| cors | ^2.8.5 | Cross-origin |
| express-rate-limit | ^8.2.1 | Rate limiting |
| zod | ^3.24.1 | Validacion schemas |
| multer | ^2.0.2 | File upload (memory) |
| @aws-sdk/client-s3 | ^3.985.0 | Cloudflare R2 |
| @aws-sdk/s3-request-presigner | ^3.985.0 | URLs firmadas |
| dotenv | ^16.4.7 | Env vars |

### Frontend (7 runtime + 13 dev)
| Paquete | Version | Uso |
|---------|---------|-----|
| react | ^18.3.1 | UI framework |
| react-dom | ^18.3.1 | DOM rendering |
| react-router-dom | ^7.1.3 | SPA routing |
| recharts | ^2.15.0 | Charts (Area, Pie/Donut) |
| lucide-react | ^0.468.0 | Iconos |
| date-fns | ^4.1.0 | Formateo fechas |
| clsx | ^2.1.1 | Classnames condicionales |

---

## 21. GIT

- **Repo:** https://github.com/NubtechAgency/lionsandhomes.git
- **Rama:** main (unica, sin feature branches)
- **Autor:** NubtechAgency <marc@nubtechagency.com>
- **Ultimo commit:** `4a5e93b` — fix: add missing migration for RefreshToken and AuditLog tables

### Historial completo (20 commits, newest first)
```
4a5e93b fix: add missing migration for RefreshToken and AuditLog tables
088f724 fix: eliminate auth loop — skip global limiter for auth, direct fetch for session check
dd02a2f fix: replace hard redirect with event to prevent login loop
17aa583 security: adversarial hardening — cookie scope, CSRF, magic bytes, sync cap
2393abf security: migrate auth to httpOnly cookies + refresh tokens (Fase 3)
70693f8 security: add audit logging for all critical actions (Fase 2)
d117a27 security: add Zod validation + endpoint-specific rate limiting (Fase 1)
d4c6942 security: implement 8 quick-win fixes from audit v2 (score 62→72)
ad283ae fix: pass SEED_USER env vars to backend container
618b626 security: harden backend, nginx, and docker configuration
4ca5486 docs: add TASKS.md with next phase plan (bulk invoice OCR + orphans)
5bb722c feat: add check-duplicates endpoint for production DB verification
4a5fa96 feat: add manual/bank filter to transactions, add duplicate check script
4ff10bd fix: project donuts only budget vs spent, add fixed expenses breakdown to General
dd3f96e fix: chart date ordering, dashboard KPIs fijos/variables, exclude General from projects
befbed6 feat: add 3 expense categories, exclude sueldos/prestamos from invoices, seed General project
b7653fc fix: boolean filter bug, chart date ordering, donut 3 segments
bd751f5 fix: project card tx count, exclude archived, donut chart for budget
8396d3a fix: amount filter accepts comma separator and partial matches
1d2fcc8 feat: multi-project allocation per transaction
```

---

## 22. CODIGO NO USADO / DEAD CODE

**Limpiado el 2026-02-21:** Se eliminaron 2 componentes, 1 interfaz, 1 funcion, y 2 dependencias.

| Que | Estado |
|-----|--------|
| `formatCurrencyShort()` en frontend/src/lib/formatters.ts | Conservado (util para futuras mejoras) |
| `formatDateShort()` en frontend/src/lib/formatters.ts | Conservado (util para futuras mejoras) |

### Notas adicionales
- **ProjectForm.tsx:** Los campos startDate/endDate existen en el state pero NO se renderizan en el formulario. startDate = today por defecto.
- **nginx.conf CSP:** `connect-src` esta hardcodeado a `https://api-lionsandhomes.nubtechagency.com` (no dinamico)
- **State management:** No hay estado global (no Redux/Zustand). Solo AuthContext + useState/useEffect local por pagina.

---

## 23. PROXIMA FASE (TASKS.md)

**Bulk Upload de Facturas con OCR + Huerfanas**

1. Schema: transactionId nullable en Invoice, campos OCR (ocrAmount, ocrDate, ocrVendor, ocrRaw, ocrStatus)
2. Servicio OCR: Claude Vision API (@anthropic-ai/sdk) — extrae importe/fecha/proveedor de PDF/imagenes
3. Servicio matching: scoring (0-100) por importe, fecha, proveedor → top 10 sugerencias
4. Endpoints: upload-bulk, orphans, suggestions, link
5. Frontend: tabs [Con transaccion] [Huerfanas] [Subir facturas]
6. Componentes: OrphanInvoiceCard, BulkUploadZone, TransactionSearchModal

---

*Generado el 2026-02-21 leyendo cada archivo del repositorio*

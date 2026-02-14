# 🦁 Lions - Sistema de Control de Gastos

Sistema web completo para gestión y control de gastos en proyectos de remodelación de apartamentos.

## 📋 Descripción

Lions es una aplicación desarrollada para controlar gastos en tiempo real de proyectos de remodelación. Incluye:

- 📊 Dashboard con KPIs en tiempo real
- 💰 Sincronización automática con transacciones bancarias (via Google Sheets + n8n)
- 🏗️ Gestión de múltiples proyectos con presupuestos
- 📄 Almacenamiento de facturas en Cloudflare R2
- 📈 Comparativas de presupuesto vs gasto real
- 🎯 Control de transacciones con/sin factura

## 🛠️ Stack Tecnológico

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- React Router DOM
- Recharts (gráficas)
- Lucide React (iconos)

### Backend
- Node.js 18+ + TypeScript
- Express
- Prisma ORM
- SQLite (desarrollo) / PostgreSQL (producción)
- JWT (autenticación)
- Bcrypt (hash de passwords)
- Cloudflare R2 (almacenamiento de facturas)
- Zod (validación)

### DevOps
- Docker + Docker Compose
- Dockploy (orquestación y deploy)
- Traefik (proxy reverso + SSL)
- n8n (automatización y sincronización)

## 📁 Estructura del Proyecto

```
/lions-expense-control
├── /frontend              # Aplicación React
│   ├── /src
│   │   ├── /pages         # Páginas principales
│   │   ├── /components    # Componentes reutilizables
│   │   ├── /hooks         # Custom hooks
│   │   ├── /services      # API calls
│   │   ├── /contexts      # Contextos de React
│   │   ├── /lib           # Utilidades
│   │   └── /types         # TypeScript interfaces
│   ├── Dockerfile
│   └── package.json
├── /backend               # API REST
│   ├── /src
│   │   ├── /routes        # Endpoints
│   │   ├── /controllers   # Lógica de negocio
│   │   ├── /middleware    # Auth, validation, errors
│   │   ├── /services      # Servicios externos (R2, cálculos)
│   │   └── /utils         # Helpers
│   ├── /prisma
│   │   └── schema.prisma  # Modelos de base de datos
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── TASK.md                # Lista de tareas del proyecto
└── README.md
```

## 🚀 Instalación y Configuración

### Prerrequisitos

- Node.js 18+ y npm
- Docker y Docker Compose
- Cuenta de Cloudflare con R2 configurado
- Instancia de n8n (para sincronización)

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd LIONS
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
# Database
DB_USER=lions_user
DB_PASSWORD=your_secure_password
DB_NAME=lions_db

# Backend
JWT_SECRET=your_jwt_secret_minimum_32_characters

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=lions-invoices
R2_PUBLIC_URL=https://lions-invoices.your-domain.com

# n8n
N8N_SYNC_TOKEN=your_secret_token
```

### 3. Instalar dependencias (desarrollo local)

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
```

**Frontend:**
```bash
cd frontend
npm install
```

### 4. Ejecutar en desarrollo

**Backend:**
```bash
cd backend
npm run dev
```
El servidor estará en `http://localhost:8000`

**Frontend:**
```bash
cd frontend
npm run dev
```
La aplicación estará en `http://localhost:3001`

### 5. Ejecutar con Docker

```bash
docker-compose up -d
```

Servicios disponibles:
- Frontend: `http://localhost:3001`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

## 📊 Base de Datos

El proyecto usa PostgreSQL con Prisma ORM. Los modelos incluyen:

- **User**: Usuario del sistema (autenticación)
- **Project**: Proyectos de remodelación
  - Estados: ACTIVE, COMPLETED, ARCHIVED
  - Presupuesto total y desglose por categoría
- **Transaction**: Transacciones bancarias (sincronizadas) + manuales
  - Asignación a proyecto y categoría
  - Control de facturas
- **ExpenseCategory**: 5 categorías de gasto (Material y mano de obra, Decoración, Compra y gastos, Otros, General)

### Ejecutar migraciones

```bash
cd backend
npx prisma migrate deploy
```

### Abrir Prisma Studio (GUI para ver datos)

```bash
cd backend
npx prisma studio
```

## 🔄 Configurar Sincronización con n8n

1. Crear workflow en n8n:
   - **Schedule Trigger**: `*/5 * * * *` (cada 5 minutos)
   - **Google Sheets Node**: Leer todas las transacciones
   - **HTTP Request Node**:
     - Method: POST
     - URL: `https://your-domain.com/api/sync/transactions`
     - Headers: `Authorization: Bearer ${N8N_SYNC_TOKEN}`
     - Body: `{ "transactions": [...] }`

2. Formato de transacciones desde Google Sheets:
```json
{
  "transactions": [
    {
      "date": "2026-02-06T00:00:00.000Z",
      "amount": -115,
      "externalId": "unique-id-from-fintable",
      "category": "Uncategorized",
      "concept": "COMPRA TARJ. LEROY MERLIN",
      "id": 137
    }
  ]
}
```

## 🔐 Autenticación

El sistema usa JWT para autenticación:

1. Login: `POST /api/auth/login`
2. El token JWT se devuelve en la respuesta
3. Incluir en headers de requests protegidas: `Authorization: Bearer {token}`

## 📄 Gestión de Facturas

Las facturas se almacenan en Cloudflare R2:

1. Frontend solicita URL firmada: `POST /api/invoices/upload-url`
2. Frontend sube archivo directo a R2
3. Frontend notifica al backend: `PATCH /api/transactions/:id/attach-invoice`
4. Backend actualiza la transacción con la URL de la factura

## 🐳 Deploy con Dockploy

### 1. Crear proyecto en Dockploy

1. Conectar repositorio de GitHub
2. Configurar rama de autodeploy (main/production)
3. Agregar todas las variables de entorno del `.env.example`

### 2. Configurar dominio

1. Agregar dominio personalizado en Dockploy
2. Traefik configurará automáticamente el SSL
3. Apuntar DNS:
   - `lions.your-domain.com` → IP del VPS

### 3. Deploy

```bash
git push origin main
```

Dockploy detectará el push y desplegará automáticamente.

## 📝 Scripts Útiles

### Backend
```bash
npm run dev         # Desarrollo con hot-reload
npm run build       # Compilar TypeScript
npm start           # Producción
npm run prisma:generate  # Generar Prisma Client
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio
```

### Frontend
```bash
npm run dev         # Desarrollo
npm run build       # Build de producción
npm run preview     # Preview del build
```

## 🧪 Testing

(Pendiente de implementar)

```bash
npm test
```

## 📖 Documentación de API

### Endpoints principales:

**Autenticación:**
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro
- `GET /api/auth/me` - Usuario actual

**Proyectos:**
- `GET /api/projects` - Listar proyectos
- `POST /api/projects` - Crear proyecto
- `GET /api/projects/:id` - Detalle de proyecto
- `PATCH /api/projects/:id` - Actualizar proyecto
- `DELETE /api/projects/:id` - Eliminar proyecto

**Transacciones:**
- `GET /api/transactions` - Listar transacciones
- `POST /api/transactions` - Crear transacción manual
- `GET /api/transactions/:id` - Detalle
- `PATCH /api/transactions/:id` - Actualizar
- `DELETE /api/transactions/:id` - Eliminar

**Sincronización:**
- `POST /api/sync/transactions` - Sincronizar desde n8n
- `GET /api/sync/status` - Estado de sincronización

**Facturas:**
- `POST /api/invoices/upload-url` - Obtener URL firmada
- `PATCH /api/transactions/:id/attach-invoice` - Asociar factura

**Dashboard:**
- `GET /api/dashboard/stats` - Estadísticas y KPIs

## 🤝 Contribución

Este proyecto es desarrollado por **NUBTECH AGENCY** para el cliente **Lions**.

## 📄 Licencia

Propiedad privada - Todos los derechos reservados © 2026 Lions

## 📞 Soporte

Para soporte técnico, contactar a NUBTECH AGENCY.

---

**Estado del proyecto:** 🟢 Listo para deploy

**Última actualización:** 2026-02-12

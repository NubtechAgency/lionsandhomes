# TASKS.md — Fases pendientes de implementación

---

## FASE SIGUIENTE: Bulk Upload de Facturas con OCR + Huérfanas

### Contexto
Subir facturas en lote, leerlas con OCR (Claude Vision API) para extraer importe/fecha/proveedor, sugerir matches con transacciones existentes, y gestionar facturas sin match en una sección "Huérfanas" en la página de Facturas.

---

### 1. Base de datos

**`backend/prisma/schema.prisma`**
- Hacer `transactionId` **nullable** (`Int?`) en Invoice → las huérfanas tienen `transactionId = null`
- Añadir campos OCR: `ocrAmount Float?`, `ocrDate DateTime?`, `ocrVendor String?`, `ocrRaw String?`
- Añadir `ocrStatus String @default("PENDING")` → PENDING | PROCESSING | COMPLETED | FAILED
- Migración no destructiva: los Invoice existentes ya tienen transactionId

---

### 2. Backend - Servicio OCR

**NUEVO: `backend/src/services/ocr.ts`**
- Instalar `@anthropic-ai/sdk`
- Nueva env var: `ANTHROPIC_API_KEY`
- Función `extractInvoiceData(fileBuffer, mimeType, fileName)` → `{ amount, date, vendor, raw }`
- Imágenes: enviar como `image` content block (base64)
- PDFs: enviar como `document` content block (base64)
- Prompt estructurado en español: extraer importe, fecha (YYYY-MM-DD), proveedor → respuesta JSON

---

### 3. Backend - Servicio de matching

**NUEVO: `backend/src/services/matching.ts`**
- Función `findSuggestions(ocrAmount, ocrDate, ocrVendor)` → `{ transaction, score, reasons }[]`
- Pool de candidatas: transacciones con `amount < 0`, `isArchived = false`, últimos 6 meses
- Scoring (0-100):
  - **Importe (50 pts)**: exacto ±1 cent = 50, ±5% = 35, ±10% = 20
  - **Fecha (30 pts)**: mismo día = 30, ±3 días = 25, ±7 = 18, ±14 = 10, ±30 = 5
  - **Proveedor (20 pts)**: substring match en concepto = 20, overlap parcial = 10
- Devolver top 10 con score >= 20

---

### 4. Backend - Endpoints

**`backend/src/controllers/invoiceController.ts`** + **`backend/src/routes/invoices.ts`**

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/invoices/upload-bulk` | Subir N archivos → R2 + OCR + crear Invoice con `transactionId=null` |
| GET | `/api/invoices/orphans` | Listar huérfanas con datos OCR + download URLs |
| GET | `/api/invoices/:invoiceId/suggestions` | Sugerencias de match para una huérfana |
| PATCH | `/api/invoices/:invoiceId/link` | Vincular huérfana a transacción `{ transactionId }` |

**`POST /upload-bulk` flow:**
1. Multer: `upload.array('files', 20)` (hasta 20 archivos, 10MB c/u)
2. Para cada archivo: upload a R2 con key `invoices/orphan-{timestamp}-{fileName}`
3. Crear Invoice en BD con `transactionId = null`, `ocrStatus = 'PROCESSING'`
4. Llamar OCR (Claude Vision) → actualizar Invoice con datos extraídos
5. Devolver todas las invoices creadas con datos OCR

**Modificar `deleteInvoice` existente:** manejar caso `transactionId = null` (no recalcular hasInvoice)

---

### 5. Frontend - Tipos y API

**`frontend/src/types/index.ts`**
```ts
export interface OrphanInvoice {
  id: number;
  fileName: string;
  downloadUrl?: string;
  ocrAmount: number | null;
  ocrDate: string | null;
  ocrVendor: string | null;
  ocrStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface MatchSuggestion {
  transaction: Transaction;
  score: number;
  reasons: string[];
}
```

**`frontend/src/services/api.ts`**
Añadir a `invoiceAPI`: `uploadBulk`, `getOrphans`, `getSuggestions`, `linkInvoice`

---

### 6. Frontend - Página Facturas rediseñada

**`frontend/src/pages/Invoices.tsx`**

**Tabs:**
```
[Con transacción]  [Huérfanas (3)]  [Subir facturas]
```

**Tab "Con transacción"**: contenido actual (tabla de transacciones con factura)

**Tab "Huérfanas"**: cards con cada factura huérfana
- Preview (miniatura imagen o icono PDF)
- Datos OCR: importe, fecha, proveedor (o "No detectado")
- Badge de estado OCR
- Botón "Ver sugerencias" → expande lista de matches sugeridos
- Cada sugerencia: fecha, concepto, importe, score, botón "Vincular"
- Botón "Buscar transacción" → modal de búsqueda manual
- Botón "Eliminar"

**Tab "Subir facturas"**: zona de upload
- Input multi-archivo (accept `.pdf,.jpg,.jpeg,.png`)
- Lista de archivos seleccionados con botón eliminar
- Botón "Subir X facturas"
- Barra de progreso durante upload + OCR
- Al terminar → cambiar automáticamente a tab "Huérfanas"

**Nuevos componentes:**
- `frontend/src/components/OrphanInvoiceCard.tsx` — card de huérfana con OCR + sugerencias
- `frontend/src/components/BulkUploadZone.tsx` — zona drag & drop / multi-file
- `frontend/src/components/TransactionSearchModal.tsx` — modal búsqueda manual de transacción

---

### 7. Docker / Deployment

**`docker-compose.yml`**
Añadir `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}` al environment del backend

---

### Orden de implementación

1. Schema Prisma + migración
2. Servicio OCR (`ocr.ts`)
3. Servicio matching (`matching.ts`)
4. Endpoints backend (upload-bulk, orphans, suggestions, link) + modificar deleteInvoice
5. Frontend tipos + API client
6. Frontend: refactor Invoices.tsx con tabs
7. Frontend: BulkUploadZone component
8. Frontend: OrphanInvoiceCard + TransactionSearchModal
9. Docker env + deploy

### Verificación

- [ ] Subir 3 facturas (1 PDF + 2 imágenes) → se crean como huérfanas
- [ ] OCR extrae importe/fecha/proveedor de cada una
- [ ] Sugerencias muestran transacciones candidatas con score
- [ ] Vincular una huérfana → pasa a "Con transacción"
- [ ] Buscar manualmente y vincular funciona
- [ ] Eliminar huérfana borra de R2 y BD
- [ ] Facturas existentes siguen funcionando (no regresión)

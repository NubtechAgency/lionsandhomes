// Constantes compartidas entre schemas y controllers

export const EXPENSE_CATEGORIES = [
  'MATERIAL_Y_MANO_DE_OBRA',
  'DECORACION',
  'COMPRA_Y_GASTOS',
  'OTROS',
  'GASTOS_PISOS',
  'BUROCRACIA',
  'SUELDOS',
  'PRESTAMOS',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INVOICE_EXEMPT_CATEGORIES: readonly ExpenseCategory[] = ['SUELDOS', 'PRESTAMOS'];

export const PROJECT_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CASH_FLOW_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CashFlowType = (typeof CASH_FLOW_TYPES)[number];

// Auto-assign: umbral de score para vincular factura a transacción automáticamente
export const AUTO_ASSIGN_THRESHOLD = parseInt(process.env.AUTO_ASSIGN_THRESHOLD || '95', 10);

export const INVOICE_SOURCES = ['web', 'telegram', 'bulk'] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

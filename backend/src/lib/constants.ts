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

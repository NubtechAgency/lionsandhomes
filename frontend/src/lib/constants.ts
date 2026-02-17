import type { ExpenseCategory } from '../types';

// Categorías de gasto de Lions - FUENTE ÚNICA
export const EXPENSE_CATEGORIES: {
  key: ExpenseCategory;
  label: string;
  description: string;
}[] = [
  {
    key: 'MATERIAL_Y_MANO_DE_OBRA',
    label: 'Material y mano de obra',
    description: 'Materiales, fontanería, materiales eléctricos...',
  },
  {
    key: 'DECORACION',
    label: 'Decoración',
    description: 'Mobiliario, carpintería, baños, vivero, armarios, suelos, calefacción...',
  },
  {
    key: 'COMPRA_Y_GASTOS',
    label: 'Compra y gastos de compra',
    description: '',
  },
  {
    key: 'OTROS',
    label: 'Otros',
    description: '',
  },
  {
    key: 'GASTOS_PISOS',
    label: 'Gastos pisos',
    description: 'Luz, agua, comunidad, basura...',
  },
  {
    key: 'BUROCRACIA',
    label: 'Burocracia',
    description: 'Abogados, impuestos...',
  },
  {
    key: 'SUELDOS',
    label: 'Sueldos',
    description: 'Nóminas y salarios',
  },
  {
    key: 'PRESTAMOS',
    label: 'Préstamos',
    description: 'Transferencias de Lions a Jorge',
  },
];

// Categorías para presupuestos de proyecto (sin globales: BUROCRACIA, SUELDOS, PRESTAMOS)
export const PROJECT_CATEGORIES = EXPENSE_CATEGORIES.filter(
  c => !['BUROCRACIA', 'SUELDOS', 'PRESTAMOS'].includes(c.key)
);

// Categorías exentas de factura (no cuentan en "sin factura")
export const INVOICE_EXEMPT_CATEGORIES: ExpenseCategory[] = ['SUELDOS', 'PRESTAMOS'];

import type { ExpenseCategory } from '../types';

// Categorías de gasto de Lions - FUENTE ÚNICA
// 4 categorías para proyectos + 1 global (GENERAL)
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
    key: 'GENERAL',
    label: 'General',
    description: 'Abogados, impuestos...',
  },
];

// Solo las categorías de proyecto (sin GENERAL)
export const PROJECT_CATEGORIES = EXPENSE_CATEGORIES.filter(c => c.key !== 'GENERAL');

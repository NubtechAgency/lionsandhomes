// Tipos TypeScript para el frontend

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
  message: string;
}

// ========================================
// TIPOS DE PROYECTOS
// ========================================

// Categorías de gasto de Lions (4 proyecto + 1 global)
export type ExpenseCategory =
  | 'MATERIAL_Y_MANO_DE_OBRA'
  | 'DECORACION'
  | 'COMPRA_Y_GASTOS'
  | 'OTROS'
  | 'BUROCRACIA';

// Estados de un proyecto
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

// Presupuesto desglosado por categorías
export type CategoryBudgets = {
  [key in ExpenseCategory]?: number;
};

// Proyecto completo
export interface Project {
  id: number;
  name: string;
  description?: string;
  status: ProjectStatus;
  totalBudget: number;
  categoryBudgets: CategoryBudgets;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    transactions: number;
  };
  totalSpent?: number;
}

// Estadísticas de un proyecto
export interface ProjectStats {
  totalSpent: number;
  transactionsWithoutInvoice: number;
  budgetUsedPercentage: number;
  spendingByCategory: {
    [key in ExpenseCategory]?: number;
  };
}

// Proyecto con estadísticas (endpoint GET /api/projects/:id)
export interface ProjectWithStats extends Project {
  stats: ProjectStats;
}

// Datos para crear un proyecto
export interface CreateProjectData {
  name: string;
  description?: string;
  status?: ProjectStatus;
  totalBudget: number;
  categoryBudgets: CategoryBudgets;
  startDate: string;
  endDate?: string;
}

// Datos para actualizar un proyecto (campos opcionales)
export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  totalBudget?: number;
  categoryBudgets?: CategoryBudgets;
  startDate?: string;
  endDate?: string;
}

// ========================================
// TIPOS DE TRANSACCIONES
// ========================================

export interface Invoice {
  id: number;
  transactionId: number;
  url: string;
  fileName: string;
  createdAt: string;
}

export interface Transaction {
  id: number;
  externalId: string | null;
  isManual: boolean;
  date: string;
  amount: number;
  concept: string;
  category: string;
  projectId: number | null;
  expenseCategory: ExpenseCategory | null;
  notes: string | null;
  hasInvoice: boolean;
  isArchived: boolean;
  isFixed: boolean;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: number;
    name: string;
  };
  invoices?: Invoice[];
}

export interface TransactionFilters {
  projectId?: number;
  expenseCategory?: ExpenseCategory;
  hasInvoice?: boolean;
  dateFrom?: string;
  dateTo?: string;
  isManual?: boolean;
  isArchived?: string; // 'true' | 'false' | 'all'
  isFixed?: boolean;
  search?: string;
  amountMin?: number;
  amountMax?: number;
  amountType?: 'expense' | 'income';
  sortBy?: 'date' | 'amount' | 'concept';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateTransactionData {
  projectId?: number | null;
  expenseCategory?: ExpenseCategory | null;
  notes?: string | null;
  isFixed?: boolean;
  date?: string;
  amount?: number;
  concept?: string;
}

export interface CreateTransactionData {
  date: string;
  amount: number;
  concept: string;
  projectId?: number | null;
  expenseCategory?: ExpenseCategory | null;
  notes?: string | null;
  isFixed?: boolean;
}

export interface TransactionPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ========================================
// TIPOS DE DASHBOARD
// ========================================

// Estadísticas por categoría (presupuesto vs gasto)
export interface CategoryStat {
  category: ExpenseCategory;
  budget: number;
  spent: number;
  percentage: number;
}

// KPIs globales del dashboard
export interface DashboardKPIs {
  totalActiveProjects: number;
  totalSpentThisMonth: number;
  totalWithoutInvoice: number;
  totalWithoutProject: number;
  totalBudget: number;
  totalSpent: number;
  totalBudgetPercentage: number;
}

// Alerta de presupuesto excedido
export interface BudgetAlert {
  projectId: number;
  projectName: string;
  category: string | null; // null = presupuesto total del proyecto
  budget: number;
  spent: number;
  percentage: number;
}

// Respuesta completa del endpoint /api/dashboard/stats
export interface DashboardStats {
  kpis: DashboardKPIs;
  categoryStats: CategoryStat[];
  recentTransactions: Transaction[];
  budgetAlerts: BudgetAlert[];
  filteredByProject: string | null;
}

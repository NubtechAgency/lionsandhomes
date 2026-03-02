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

export interface AuthResponse {
  message: string;
  user: User;
}

export interface ApiError {
  error: string;
  message: string;
}

// ========================================
// TIPOS DE PROYECTOS
// ========================================

// Categorías de gasto de Lions
export type ExpenseCategory =
  | 'MATERIAL_Y_MANO_DE_OBRA'
  | 'DECORACION'
  | 'COMPRA_Y_GASTOS'
  | 'OTROS'
  | 'GASTOS_PISOS'
  | 'BUROCRACIA'
  | 'SUELDOS'
  | 'PRESTAMOS';

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

export type OcrStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'BUDGET_EXCEEDED';

export type InvoiceSource = 'web' | 'telegram' | 'bulk';

export interface Invoice {
  id: number;
  transactionId: number | null;
  url: string;
  fileName: string;
  ocrStatus?: OcrStatus;
  ocrAmount?: number | null;
  ocrDate?: string | null;
  ocrVendor?: string | null;
  ocrError?: string | null;
  ocrCostCents?: number | null;
  source?: InvoiceSource;
  createdAt: string;
}

export interface OrphanInvoice {
  id: number;
  transactionId: null;
  fileName: string;
  downloadUrl: string;
  ocrStatus: OcrStatus;
  ocrAmount: number | null;
  ocrDate: string | null;
  ocrVendor: string | null;
  ocrError: string | null;
  ocrCostCents: number | null;
  source?: InvoiceSource;
  createdAt: string;
}

export interface MatchSuggestion {
  transactionId: number;
  score: number;
  scoreBreakdown: {
    amountScore: number;
    dateScore: number;
    conceptScore: number;
  };
  transaction: {
    id: number;
    date: string;
    amount: number;
    concept: string;
    hasInvoice: boolean;
    projectId: number | null;
    expenseCategory: string | null;
    notes: string | null;
    project: { id: number; name: string } | null;
  };
}

export interface BulkUploadResult {
  fileName: string;
  status: 'COMPLETED' | 'FAILED' | 'BUDGET_EXCEEDED' | 'INVALID';
  error?: string;
  invoice: Invoice | null;
  suggestions: MatchSuggestion[];
}

export interface OcrBudgetStatus {
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
  allowed: boolean;
  callCount: number;
  avgCostCents: number;
  month: string;
}

export interface TransactionAllocation {
  id: number;
  transactionId?: number;
  projectId: number;
  amount: number;
  project?: {
    id: number;
    name: string;
  };
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
  needsReview: boolean;
  duplicateGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: number;
    name: string;
  };
  allocations?: TransactionAllocation[];
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
  needsReview?: boolean;
  search?: string;
  amountMin?: number;
  amountMax?: number;
  amountType?: 'expense' | 'income';
  sortBy?: 'date' | 'amount' | 'concept';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateTransactionData {
  projectId?: number | null;
  allocations?: { projectId: number; amount: number }[];
  expenseCategory?: ExpenseCategory | null;
  notes?: string | null;
  isFixed?: boolean;
  needsReview?: boolean;
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
// TIPOS DE FLUJO DE CAJA
// ========================================

export type CashFlowType = 'INCOME' | 'EXPENSE';

export interface CashFlowEntry {
  id: number;
  type: CashFlowType;
  description: string;
  amount: number;
  date: string;
  projectId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: number;
    name: string;
  };
}

export interface CashFlowFilters {
  type?: CashFlowType;
  projectId?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'amount' | 'description';
  sortOrder?: 'asc' | 'desc';
}

export interface CashFlowSummaryMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
}

export interface CreateCashFlowData {
  type: CashFlowType;
  description: string;
  amount: number;
  date: string;
  projectId?: number | null;
  notes?: string | null;
}

export interface UpdateCashFlowData {
  type?: CashFlowType;
  description?: string;
  amount?: number;
  date?: string;
  projectId?: number | null;
  notes?: string | null;
}

// Wizard de Plan de Pagos
export type TrancheFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly';

export interface PlanTranche {
  id: string;
  amount: number;
  startDate: string;
  frequency: TrancheFrequency;
  repetitions: number;
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
  totalFixed: number;
  totalVariable: number;
  fixedByCategory: Record<string, number>;
  filteredByProject: string | null;
}

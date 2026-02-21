// Cliente HTTP centralizado para llamadas a la API (httpOnly cookies)
import type {
  LoginCredentials,
  AuthResponse,
  User,
  Project,
  ProjectWithStats,
  CreateProjectData,
  UpdateProjectData,
  ProjectStatus,
  Transaction,
  TransactionFilters,
  CreateTransactionData,
  UpdateTransactionData,
  TransactionPagination,
  DashboardStats,
} from '../types';

// En dev usa Vite proxy (mismo origen), en prod usa VITE_API_URL
const API_URL = import.meta.env.VITE_API_URL || '';

// Flag global: si la sesión ya expiró, no intentar más refreshes
let sessionExpired = false;

// Singleton para deduplicar refreshes concurrentes
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      sessionExpired = false;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Resetear el flag de sesión expirada (llamar tras login exitoso) */
export function resetSessionExpired() {
  sessionExpired = false;
}

/**
 * Función auxiliar para hacer peticiones HTTP con httpOnly cookies
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  let response = await fetch(`${API_URL}${endpoint}`, config);

  // Si 401, intentar refresh transparente.
  // Excluir: login, refresh, logout, y si ya sabemos que la sesión expiró.
  const isAuthEndpoint =
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/refresh') ||
    endpoint.includes('/auth/logout');

  if (response.status === 401 && !isAuthEndpoint && !sessionExpired) {
    // Deduplicar: si ya hay un refresh en curso, esperar a ese
    if (!refreshPromise) {
      refreshPromise = attemptRefresh().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      // Reintentar la request original con la nueva cookie
      response = await fetch(`${API_URL}${endpoint}`, config);
    } else {
      // Refresh falló — marcar sesión expirada y notificar AuthContext.
      sessionExpired = true;
      window.dispatchEvent(new Event('auth:session-expired'));
      throw new Error('Sesión expirada');
    }
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error en la petición');
  }

  return response.json();
}

// ========================================
// AUTENTICACIÓN
// ========================================

export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return fetchAPI<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  getCurrentUser: async (): Promise<{ user: User }> => {
    return fetchAPI<{ user: User }>('/api/auth/me');
  },

  refresh: async (): Promise<{ message: string; user: User }> => {
    return fetchAPI<{ message: string; user: User }>('/api/auth/refresh', {
      method: 'POST',
    });
  },

  logout: async (): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    });
  },
};

// ========================================
// PROYECTOS
// ========================================

export const projectAPI = {
  /**
   * Listar todos los proyectos
   * @param status - Filtro opcional por estado (ACTIVE, COMPLETED, ARCHIVED)
   */
  listProjects: async (status?: ProjectStatus): Promise<{ projects: Project[] }> => {
    const queryParams = status ? `?status=${status}` : '';
    return fetchAPI<{ projects: Project[] }>(`/api/projects${queryParams}`);
  },

  /**
   * Obtener un proyecto por ID con estadísticas
   */
  getProject: async (id: number): Promise<{ project: ProjectWithStats }> => {
    return fetchAPI<{ project: ProjectWithStats }>(`/api/projects/${id}`);
  },

  /**
   * Crear un nuevo proyecto
   */
  createProject: async (data: CreateProjectData): Promise<{ message: string; project: Project }> => {
    return fetchAPI<{ message: string; project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar un proyecto existente
   */
  updateProject: async (
    id: number,
    data: UpdateProjectData
  ): Promise<{ message: string; project: Project }> => {
    return fetchAPI<{ message: string; project: Project }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar un proyecto
   */
  deleteProject: async (id: number): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },
};

// ========================================
// TRANSACCIONES
// ========================================

export const transactionAPI = {
  /**
   * Crear una transacción manual
   */
  createTransaction: async (
    data: CreateTransactionData
  ): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Listar transacciones con filtros
   */
  listTransactions: async (
    filters?: TransactionFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: Transaction[];
    pagination: TransactionPagination;
    stats: {
      totalExpenses: number;
      withoutInvoice: number;
      unassigned: number;
    };
  }> => {
    const params = new URLSearchParams();

    if (filters?.projectId === -1) params.append('projectId', 'none');
    else if (filters?.projectId) params.append('projectId', filters.projectId.toString());
    if (filters?.expenseCategory) params.append('expenseCategory', filters.expenseCategory);
    if (filters?.hasInvoice !== undefined) params.append('hasInvoice', filters.hasInvoice.toString());
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.isManual !== undefined) params.append('isManual', filters.isManual.toString());
    if (filters?.isArchived) params.append('isArchived', filters.isArchived);
    if (filters?.isFixed !== undefined) params.append('isFixed', filters.isFixed.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.amountMin) params.append('amountMin', filters.amountMin.toString());
    if (filters?.amountMax) params.append('amountMax', filters.amountMax.toString());
    if (filters?.amountType) params.append('amountType', filters.amountType);
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const queryString = params.toString();
    return fetchAPI<{
      transactions: Transaction[];
      pagination: TransactionPagination;
      stats: {
        totalExpenses: number;
        withoutInvoice: number;
        unassigned: number;
      };
    }>(`/api/transactions${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Obtener una transacción por ID
   */
  getTransaction: async (id: number): Promise<{ transaction: Transaction }> => {
    return fetchAPI<{ transaction: Transaction }>(`/api/transactions/${id}`);
  },

  /**
   * Actualizar una transacción (asignación manual)
   */
  updateTransaction: async (
    id: number,
    data: UpdateTransactionData
  ): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Archivar/desarchivar una transacción (toggle)
   */
  archiveTransaction: async (id: number): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>(`/api/transactions/${id}/archive`, {
      method: 'PATCH',
    });
  },
};

// ========================================
// DASHBOARD
// ========================================

export const dashboardAPI = {
  /**
   * Obtener estadísticas del dashboard
   * @param projectId - Filtro opcional por proyecto específico
   */
  getStats: async (projectId?: number): Promise<DashboardStats> => {
    const queryParams = projectId ? `?projectId=${projectId}` : '';
    return fetchAPI<DashboardStats>(`/api/dashboard/stats${queryParams}`);
  },
};

// ========================================
// FACTURAS (Cloudflare R2)
// ========================================

export const invoiceAPI = {
  /**
   * Subir factura via backend proxy (añade a la transacción, permite múltiples)
   */
  uploadInvoice: async (
    transactionId: number,
    file: File
  ): Promise<{ message: string; transaction: Transaction }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('transactionId', transactionId.toString());

    const response = await fetch(`${API_URL}/api/invoices/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error al subir la factura');
    }

    return response.json();
  },

  /**
   * Obtener todas las facturas de una transacción con URLs de descarga firmadas
   */
  getInvoiceUrls: async (
    transactionId: number
  ): Promise<{
    invoices: { id: number; fileName: string; downloadUrl: string; createdAt: string }[];
    expiresIn: number;
  }> => {
    return fetchAPI(`/api/invoices/${transactionId}`);
  },

  /**
   * Eliminar una factura individual por su ID
   */
  deleteInvoice: async (
    invoiceId: number
  ): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>(
      `/api/invoices/${invoiceId}`,
      { method: 'DELETE' }
    );
  },
};

export default {
  auth: authAPI,
  projects: projectAPI,
  transactions: transactionAPI,
  dashboard: dashboardAPI,
  invoices: invoiceAPI,
};

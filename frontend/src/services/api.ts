// Cliente HTTP centralizado para llamadas a la API
import type {
  LoginCredentials,
  RegisterData,
  AuthResponse,
  User,
  Project,
  ProjectWithStats,
  CreateProjectData,
  UpdateProjectData,
  ProjectStatus,
  Transaction,
  TransactionFilters,
  UpdateTransactionData,
  TransactionPagination,
  DashboardStats,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Función auxiliar para hacer peticiones HTTP
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);

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
  /**
   * Iniciar sesión
   */
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return fetchAPI<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  /**
   * Registrar nuevo usuario
   */
  register: async (data: RegisterData): Promise<AuthResponse> => {
    return fetchAPI<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Obtener usuario actual
   */
  getCurrentUser: async (): Promise<{ user: User }> => {
    return fetchAPI<{ user: User }>('/api/auth/me');
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
   * Listar transacciones con filtros
   */
  listTransactions: async (
    filters?: TransactionFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: Transaction[];
    pagination: TransactionPagination;
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
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const queryString = params.toString();
    return fetchAPI<{
      transactions: Transaction[];
      pagination: TransactionPagination;
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
   * Obtener URL firmada para subir una factura
   */
  getUploadUrl: async (
    transactionId: number,
    fileName: string
  ): Promise<{ uploadUrl: string; key: string; expiresIn: number }> => {
    return fetchAPI<{ uploadUrl: string; key: string; expiresIn: number }>('/api/invoices/upload-url', {
      method: 'POST',
      body: JSON.stringify({ transactionId, fileName }),
    });
  },

  /**
   * Subir archivo directamente a R2 usando URL firmada
   */
  uploadFile: async (uploadUrl: string, file: File): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error('Error al subir el archivo a R2');
    }
  },

  /**
   * Asociar factura subida a una transacción
   */
  attachInvoice: async (
    transactionId: number,
    key: string,
    fileName: string
  ): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>(
      `/api/invoices/transactions/${transactionId}/attach-invoice`,
      {
        method: 'PATCH',
        body: JSON.stringify({ key, fileName }),
      }
    );
  },

  /**
   * Obtener URL firmada para descargar una factura
   */
  getDownloadUrl: async (
    transactionId: number
  ): Promise<{ downloadUrl: string; fileName: string; expiresIn: number }> => {
    return fetchAPI<{ downloadUrl: string; fileName: string; expiresIn: number }>(
      `/api/invoices/${transactionId}`
    );
  },

  /**
   * Eliminar factura de una transacción (borra de R2 y limpia DB)
   */
  deleteInvoice: async (
    transactionId: number
  ): Promise<{ message: string; transaction: Transaction }> => {
    return fetchAPI<{ message: string; transaction: Transaction }>(
      `/api/invoices/transactions/${transactionId}`,
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

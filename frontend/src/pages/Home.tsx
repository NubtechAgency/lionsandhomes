import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, projectAPI, invoiceAPI } from '../services/api';
import type { DashboardStats, Project } from '../types';
import ProjectCard from '../components/ProjectCard';
import { formatCurrency } from '../lib/formatters';
import { GENERAL_PROJECT_NAME } from '../lib/constants';
import {
  FolderOpen,
  Receipt,
  AlertTriangle,
  ChevronRight,
  ScanLine,
} from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, projectsRes, orphansRes] = await Promise.all([
          dashboardAPI.getStats(),
          projectAPI.listProjects('ACTIVE'),
          invoiceAPI.listOrphans({}, 1, 0).catch(() => ({ pagination: { total: 0 } })),
        ]);
        setStats(statsRes);
        setProjects(projectsRes.projects.filter((p: Project) => p.name !== GENERAL_PROJECT_NAME));
        setOrphanCount(orphansRes.pagination.total);
      } catch (err) {
        console.error('Error loading home data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
      </div>
    );
  }

  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalSpent = stats?.kpis.totalSpent ?? 0;

  // Build pending actions
  const actions: { icon: React.ElementType; label: string; count: number; path: string; linkLabel: string }[] = [];

  if (orphanCount > 0) {
    actions.push({
      icon: ScanLine,
      label: 'facturas sin asignar',
      count: orphanCount,
      path: '/invoices/scanner',
      linkLabel: 'Escáner',
    });
  }
  if (stats && stats.kpis.totalWithoutProject > 0) {
    actions.push({
      icon: FolderOpen,
      label: 'transacciones sin proyecto',
      count: stats.kpis.totalWithoutProject,
      path: '/treasury?projectId=none',
      linkLabel: 'Cuentas',
    });
  }
  if (stats && stats.kpis.totalWithoutInvoice > 0) {
    actions.push({
      icon: Receipt,
      label: 'transacciones sin factura',
      count: stats.kpis.totalWithoutInvoice,
      path: '/treasury?hasInvoice=false',
      linkLabel: 'Cuentas',
    });
  }
  if (stats && stats.budgetAlerts.length > 0) {
    actions.push({
      icon: AlertTriangle,
      label: 'alertas de presupuesto',
      count: stats.budgetAlerts.length,
      path: '/projects',
      linkLabel: 'Proyectos',
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Finanzas */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Finanzas</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Presupuesto total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalBudget)}€
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Gastos</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalSpent)}€
              </p>
              {totalBudget > 0 && (
                <p className="text-sm text-amber-600 mt-0.5">
                  {Math.round((totalSpent / totalBudget) * 100)}% del presupuesto
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Disponible</p>
              <p className={`text-2xl font-bold ${totalBudget - totalSpent < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(totalBudget - totalSpent)}€
              </p>
            </div>
          </div>
        </div>

        {/* Acciones pendientes */}
        {actions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones pendientes</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {actions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(action.path)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} className="text-gray-400" />
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">{action.count}</span>{' '}
                        {action.label}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-amber-600 font-medium">
                      {action.linkLabel}
                      <ChevronRight size={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resumen por proyecto */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Proyectos activos</h2>
            <button
              onClick={() => navigate('/projects')}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
            >
              Ver todos <ChevronRight size={16} />
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No hay proyectos activos</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(p => (
                <ProjectCard key={p.id} project={p} spent={p.totalSpent || 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

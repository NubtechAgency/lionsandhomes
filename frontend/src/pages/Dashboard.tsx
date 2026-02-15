import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI, projectAPI, transactionAPI } from '../services/api';
import type { DashboardStats, Project, Transaction } from '../types';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import ExpenseBarChart from '../components/charts/ExpenseBarChart';
import BudgetVsSpendingChart from '../components/charts/BudgetVsSpendingChart';
import { formatCurrency } from '../lib/formatters';
import { FolderOpen, TrendingDown, FileText, FolderX } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await projectAPI.listProjects('ACTIVE');
        setProjects(response.projects);
      } catch (err) {
        console.error('Error al cargar proyectos:', err);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [statsData, txData] = await Promise.all([
          dashboardAPI.getStats(selectedProjectId),
          transactionAPI.listTransactions(
            selectedProjectId ? { projectId: selectedProjectId } : undefined,
            5000,
            0
          ),
        ]);
        setStats(statsData);
        setAllTransactions(txData.transactions);
      } catch (err) {
        console.error('Error al cargar datos:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar datos');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [selectedProjectId]);

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Hola, {user?.name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {stats?.filteredByProject
                ? `Proyecto: ${stats.filteredByProject}`
                : 'Vista general de todos los proyectos'}
            </p>
          </div>
          <select
            value={selectedProjectId || ''}
            onChange={e => setSelectedProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Todos los proyectos</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        ) : stats && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KPICard
                title="Proyectos Activos"
                value={stats.kpis.totalActiveProjects}
                subtitle="En progreso"
                icon={FolderOpen}
                color="amber"
                tooltip="Proyectos con estado 'Activo'. Haz click para verlos."
                onClick={() => navigate('/projects')}
              />
              <KPICard
                title="Gastado Total"
                value={`€${formatCurrency(stats.kpis.totalSpent)}`}
                subtitle="Suma de todos los gastos"
                icon={TrendingDown}
                color={stats.kpis.totalSpent > 0 ? 'red' : 'green'}
                tooltip="Suma total de todos los gastos registrados en el sistema"
              />
              <KPICard
                title="Sin Factura"
                value={stats.kpis.totalWithoutInvoice}
                subtitle="Transacciones pendientes"
                icon={FileText}
                color={stats.kpis.totalWithoutInvoice > 0 ? 'red' : 'green'}
                tooltip="Gastos que aún no tienen factura adjunta. Haz click para verlos."
                onClick={() => navigate('/transactions?hasInvoice=false')}
              />
              <KPICard
                title="Sin Proyecto"
                value={stats.kpis.totalWithoutProject}
                subtitle="Transacciones sin asignar"
                icon={FolderX}
                color={stats.kpis.totalWithoutProject > 0 ? 'red' : 'green'}
                tooltip="Gastos que no están asignados a ningún proyecto. Haz click para verlos."
                onClick={() => navigate('/transactions?projectId=none')}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Evolución de Gastos</h3>
                <ExpenseBarChart transactions={allTransactions} />
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Presupuesto vs Gasto</h3>
                <BudgetVsSpendingChart categoryStats={stats.categoryStats} />
              </div>
            </div>

            {/* Proyectos activos */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Proyectos Activos</h3>
                <button
                  onClick={() => navigate('/projects')}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  Ver todos
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No hay proyectos activos
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {projects.map(p => {
                    const spent = p.totalSpent || 0;
                    const remaining = p.totalBudget - spent;
                    const pct = p.totalBudget > 0 ? (spent / p.totalBudget) * 100 : 0;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-5 py-4 hover:bg-amber-50/30 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p._count?.transactions || 0} transacciones
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-800">
                              €{formatCurrency(spent)} / €{formatCurrency(p.totalBudget)}
                            </p>
                            <p className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {remaining < 0 ? 'Excedido' : `€${formatCurrency(remaining)} disponible`}
                            </p>
                          </div>
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

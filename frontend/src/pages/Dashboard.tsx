import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI, projectAPI, transactionAPI } from '../services/api';
import type { DashboardStats, Project, Transaction } from '../types';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import ExpenseBarChart from '../components/charts/ExpenseBarChart';
import BudgetVsSpendingChart from '../components/charts/BudgetVsSpendingChart';
import { formatCurrency, formatDate } from '../lib/formatters';
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
            500,
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

  // Filter transactions from last 7 days
  const recentTransactions = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return allTransactions
      .filter(t => new Date(t.date) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions]);

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

            {/* Last 7 days transactions */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Últimos 7 días</h3>
                <button
                  onClick={() => navigate('/transactions')}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  Ver todas
                </button>
              </div>

              {recentTransactions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No hay transacciones en los últimos 7 días
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-amber-50/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Fecha</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Concepto</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Importe</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Proyecto</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Factura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentTransactions.map(t => (
                      <tr
                        key={t.id}
                        className="hover:bg-amber-50/30 cursor-pointer transition-colors"
                        onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.concept)}`)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(t.date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{t.concept}</td>
                        <td className={`px-4 py-3 text-sm font-semibold text-right ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {t.amount < 0 ? '-' : '+'}€{formatCurrency(Math.abs(t.amount))}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {t.project ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/projects/${t.project!.id}`); }}
                              className="text-amber-600 hover:text-amber-700 hover:underline"
                            >
                              {t.project.name}
                            </button>
                          ) : (
                            <span className="text-gray-400 italic">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {t.hasInvoice ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sí</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

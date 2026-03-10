import { useState, useEffect, useMemo } from 'react';
import { dashboardAPI, projectAPI, transactionAPI } from '../services/api';
import type { DashboardStats, Project } from '../types';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import ExpenseBarChart from '../components/charts/ExpenseBarChart';
import DonutChart from '../components/charts/DonutChart';
import { formatCurrency } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { Lock, Repeat } from 'lucide-react';

export default function Dashboard() {

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [chartTransactions, setChartTransactions] = useState<{ amount: number; date: string; isFixed: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter out "General" from project listings
  const displayProjects = useMemo(
    () => projects.filter(p => p.name !== 'General'),
    [projects]
  );

  // Load projects and auto-select first one
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await projectAPI.listProjects('ACTIVE');
        setProjects(response.projects);
        const active = response.projects.filter((p: Project) => p.name !== 'General');
        if (active.length > 0 && !selectedProjectId) {
          setSelectedProjectId(active[0].id);
        }
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
            selectedProjectId ? { projectId: selectedProjectId, amountType: 'expense' } : { amountType: 'expense' },
            500,
            0
          ),
        ]);
        setStats(statsData);
        setChartTransactions(txData.transactions.map((t: any) => ({ amount: t.amount, date: t.date, isFixed: t.isFixed })));
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
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            {stats?.filteredByProject && (
              <p className="text-gray-500 text-sm mt-1">
                Proyecto: {stats.filteredByProject}
              </p>
            )}
          </div>
          <select
            value={selectedProjectId || ''}
            onChange={e => setSelectedProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {displayProjects.map(p => (
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
            {/* Charts row + Gastos Fijos/Variables KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Evolución de Gastos</h3>
                <ExpenseBarChart transactions={chartTransactions as any} />
              </div>
              <div className="flex flex-col gap-4">
                <KPICard
                  title="Gastos Fijos"
                  value={`€${formatCurrency(stats.totalFixed)}`}
                  subtitle="Total acumulado"
                  icon={Lock}
                  color="blue"
                  tooltip="Suma de todos los gastos marcados como fijos"
                />
                <KPICard
                  title="Gastos Variables"
                  value={`€${formatCurrency(stats.totalVariable)}`}
                  subtitle="Total acumulado"
                  icon={Repeat}
                  color="amber"
                  tooltip="Suma de todos los gastos marcados como variables"
                />
              </div>
            </div>

            {/* Presupuesto por categoría */}
            {stats.categoryStats.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Presupuesto por Categoría</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {stats.categoryStats
                    .filter(cs => cs.budget > 0 || cs.spent > 0)
                    .map(cs => {
                      const catLabel = EXPENSE_CATEGORIES.find(c => c.key === cs.category)?.label || cs.category;
                      const fixedAmount = stats.fixedByCategory[cs.category] || 0;
                      const variableAmount = cs.spent - fixedAmount;
                      return (
                        <DonutChart
                          key={cs.category}
                          spent={cs.spent}
                          total={cs.budget}
                          label={catLabel}
                          fixed={fixedAmount}
                          variable={variableAmount > 0 ? variableAmount : 0}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

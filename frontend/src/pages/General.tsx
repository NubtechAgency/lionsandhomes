import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI } from '../services/api';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import DonutChart from '../components/charts/DonutChart';
import { formatCurrency, formatPercentage } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { Wallet, TrendingDown, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DashboardStats } from '../types';

export default function General() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await dashboardAPI.getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">General</h1>
        <p className="text-gray-500 mb-6">Resumen global de la empresa</p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
          </div>
        ) : stats ? (
          <>
            {/* Alertas de Presupuesto - ARRIBA */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Alertas de Presupuesto</h3>

              {stats.budgetAlerts && stats.budgetAlerts.length > 0 ? (
                <div className="space-y-3">
                  {stats.budgetAlerts.map((alert, idx) => {
                    const catLabel = alert.category
                      ? EXPENSE_CATEGORIES.find(c => c.key === alert.category)?.label || alert.category
                      : 'Presupuesto total';

                    return (
                      <div
                        key={idx}
                        onClick={() => navigate(`/projects/${alert.projectId}`)}
                        className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                      >
                        <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-red-800">
                            {alert.projectName}
                            <span className="font-normal text-red-600"> — {catLabel}</span>
                          </p>
                          <p className="text-xs text-red-600 mt-0.5">
                            Gastado €{formatCurrency(alert.spent)} de €{formatCurrency(alert.budget)} ({alert.percentage}%)
                          </p>
                        </div>
                        <span className="text-sm font-bold text-red-600 flex-shrink-0">
                          +{formatPercentage(alert.percentage - 100)} excedido
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-lg">
                  <CheckCircle2 size={20} className="text-green-500" />
                  <p className="text-sm font-medium text-green-700">
                    Todo dentro de presupuesto — ninguna categoría ni proyecto ha superado su límite
                  </p>
                </div>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <KPICard
                title="Total Presupuestado"
                value={`€${formatCurrency(stats.kpis.totalBudget)}`}
                subtitle={`${stats.kpis.totalActiveProjects} proyectos activos`}
                icon={Wallet}
                color="amber"
                tooltip="Suma de presupuestos de todos los proyectos activos"
              />
              <KPICard
                title="Total Gastado"
                value={`€${formatCurrency(stats.kpis.totalSpent)}`}
                subtitle={`${formatPercentage(stats.kpis.totalBudgetPercentage)} del presupuesto`}
                icon={TrendingDown}
                color={stats.kpis.totalBudgetPercentage > 90 ? 'red' : 'green'}
                tooltip="Total gastado en todos los proyectos activos"
              />
              <KPICard
                title="Disponible"
                value={`€${formatCurrency(Math.max(stats.kpis.totalBudget - stats.kpis.totalSpent, 0))}`}
                subtitle={stats.kpis.totalBudget - stats.kpis.totalSpent < 0 ? 'Presupuesto excedido' : 'Presupuesto restante'}
                icon={BarChart3}
                color={stats.kpis.totalBudget - stats.kpis.totalSpent < 0 ? 'red' : 'blue'}
                tooltip="Diferencia entre presupuesto total y gasto total"
              />
            </div>

            {/* Presupuesto Total + Por Categoría */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Donut grande: presupuesto total */}
              <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center justify-center">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Presupuesto Total</h3>
                <DonutChart
                  spent={stats.kpis.totalSpent}
                  total={stats.kpis.totalBudget}
                  label="Global"
                  size="lg"
                />
              </div>

              {/* Grid de donuts por categoría (solo las que tienen presupuesto) */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Por Categoría</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {stats.categoryStats
                    .filter(stat => stat.budget > 0)
                    .map(stat => {
                    const cat = EXPENSE_CATEGORIES.find(c => c.key === stat.category);
                    return (
                      <DonutChart
                        key={stat.category}
                        spent={stat.spent}
                        total={stat.budget}
                        label={cat?.label || stat.category}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-12">Error al cargar datos</div>
        )}
      </div>
    </div>
  );
}

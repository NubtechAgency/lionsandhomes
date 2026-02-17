import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, transactionAPI } from '../services/api';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import DonutChart from '../components/charts/DonutChart';
import { formatCurrency, formatPercentage } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { Wallet, TrendingDown, BarChart3, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import type { DashboardStats, Transaction } from '../types';

export default function General() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statsData, txData] = await Promise.all([
        dashboardAPI.getStats(),
        transactionAPI.listTransactions(undefined, 5000, 0),
      ]);
      setStats(statsData);
      setTransactions(txData.transactions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Compute fixed expenses by category
  const fixedByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    transactions.forEach(t => {
      if (t.amount < 0 && t.isFixed) {
        const amt = Math.abs(t.amount);
        total += amt;
        const cat = t.expenseCategory || 'SIN_CATEGORIA';
        map[cat] = (map[cat] || 0) + amt;
      }
    });
    return { map, total };
  }, [transactions]);

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
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

            {/* Gastos Fijos por Categoría */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Lock size={18} className="text-blue-500" />
                <h3 className="text-lg font-semibold text-gray-800">Gastos Fijos por Categoría</h3>
                <span className="ml-auto text-sm font-bold text-blue-600">
                  Total: €{formatCurrency(fixedByCategory.total)}
                </span>
              </div>

              {fixedByCategory.total === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">No hay gastos fijos registrados</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(fixedByCategory.map)
                    .sort(([, a], [, b]) => b - a)
                    .map(([catKey, amount]) => {
                      const cat = EXPENSE_CATEGORIES.find(c => c.key === catKey);
                      const pct = fixedByCategory.total > 0 ? (amount / fixedByCategory.total) * 100 : 0;
                      return (
                        <div key={catKey} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">
                                {cat?.label || catKey}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">
                                €{formatCurrency(amount)}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right shrink-0">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-12">Error al cargar datos</div>
        )}
      </div>
    </div>
  );
}

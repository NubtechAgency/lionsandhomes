import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectAPI, transactionAPI } from '../services/api';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import CategoryProgressList from '../components/CategoryProgressList';
import GaugeChart from '../components/charts/GaugeChart';
import BudgetVsSpendingChart from '../components/charts/BudgetVsSpendingChart';
import { formatCurrency, formatPercentage, formatDate } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { Wallet, Pencil, Trash2, Construction, AlertTriangle, CheckCircle2, ArrowUp, ArrowDown } from 'lucide-react';
import type { ProjectWithStats, Transaction, CategoryStat } from '../types';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'transactions' | 'calendar'>('general');
  const [txSortBy, setTxSortBy] = useState<'date' | 'amount' | 'concept'>('date');
  const [txSortOrder, setTxSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadData(parseInt(id));
  }, [id]);

  const loadData = async (projectId: number) => {
    try {
      setIsLoading(true);
      const [projectRes, txRes] = await Promise.all([
        projectAPI.getProject(projectId),
        transactionAPI.listTransactions({ projectId }, 200, 0),
      ]);
      setProject(projectRes.project);
      setTransactions(txRes.transactions);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el proyecto');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !confirm('¿Eliminar este proyecto?')) return;
    try {
      await projectAPI.deleteProject(project.id);
      navigate('/projects');
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-amber-50/30">
        <Navbar />
        <div className="ml-0 p-8 flex items-center justify-center min-h-[80vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-amber-50/30">
        <Navbar />
        <div className="p-8 text-center">
          <p className="text-red-600">{error || 'Proyecto no encontrado'}</p>
          <button onClick={() => navigate('/projects')} className="mt-4 text-amber-600 hover:underline">
            Volver a Proyectos
          </button>
        </div>
      </div>
    );
  }

  const { stats } = project;
  const remaining = project.totalBudget - stats.totalSpent;
  const invoiceCount = transactions.filter(t => t.hasInvoice).length;

  // Build categoryStats for the chart
  const categoryStats: CategoryStat[] = Object.keys(project.categoryBudgets).map(key => {
    const budget = (project.categoryBudgets as Record<string, number>)[key] || 0;
    const spent = (stats as any).spendingByCategory?.[key] || 0;
    return {
      category: key as any,
      budget,
      spent,
      percentage: budget > 0 ? (spent / budget) * 100 : 0,
    };
  });

  // Build spendingByCategory for progress list
  const spendingByCategory: Record<string, number> = {};
  const fixedByCategory: Record<string, number> = {};
  let fixedTotal = 0;
  let variableTotal = 0;
  transactions.forEach(t => {
    if (t.amount < 0) {
      const amt = Math.abs(t.amount);
      if (t.isFixed) fixedTotal += amt;
      else variableTotal += amt;
      if (t.expenseCategory) {
        spendingByCategory[t.expenseCategory] = (spendingByCategory[t.expenseCategory] || 0) + amt;
        if (t.isFixed) {
          fixedByCategory[t.expenseCategory] = (fixedByCategory[t.expenseCategory] || 0) + amt;
        }
      }
    }
  });

  const statusBadge = {
    ACTIVE: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-blue-100 text-blue-800',
    ARCHIVED: 'bg-gray-100 text-gray-800',
  }[project.status] || 'bg-gray-100 text-gray-800';

  const statusLabel = {
    ACTIVE: 'Activo',
    COMPLETED: 'Completado',
    ARCHIVED: 'Archivado',
  }[project.status] || project.status;

  const handleTxSort = (column: 'date' | 'amount' | 'concept') => {
    if (txSortBy === column) {
      setTxSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setTxSortBy(column);
      setTxSortOrder('desc');
    }
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const dir = txSortOrder === 'asc' ? 1 : -1;
    if (txSortBy === 'amount') return (a.amount - b.amount) * dir;
    if (txSortBy === 'concept') return a.concept.localeCompare(b.concept) * dir;
    return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
  });

  const TxSortIcon = ({ column }: { column: string }) => {
    if (txSortBy !== column) return null;
    return txSortOrder === 'asc'
      ? <ArrowUp size={12} className="inline ml-1" />
      : <ArrowDown size={12} className="inline ml-1" />;
  };

  const tabs = [
    { id: 'general' as const, label: 'Vista general' },
    { id: 'transactions' as const, label: `Transacciones (${transactions.length})` },
    { id: 'calendar' as const, label: 'Calendario' },
  ];

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => navigate('/projects')} className="text-amber-600 hover:underline text-sm mb-2 block">
              ← Proyectos
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge}`}>
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/projects/${project.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Pencil size={16} /> Editar
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <KPICard
            title="Disponible"
            value={`€${formatCurrency(remaining)}`}
            subtitle={`€${formatCurrency(stats.totalSpent)} gastado de €${formatCurrency(project.totalBudget)}`}
            icon={Wallet}
            color={remaining < 0 ? 'red' : 'blue'}
            tooltip="Diferencia entre presupuesto y gasto total del proyecto"
          />
          <KPICard
            title="Consumido"
            value={formatPercentage(stats.budgetUsedPercentage)}
            subtitle={`${transactions.length} transacciones`}
            color={stats.budgetUsedPercentage > 100 ? 'red' : stats.budgetUsedPercentage > 80 ? 'amber' : 'green'}
            tooltip="Porcentaje del presupuesto total ya gastado en este proyecto"
          />
          <KPICard
            title="Transacciones"
            value={transactions.length}
            subtitle="En este proyecto"
            color="amber"
            tooltip="Número total de transacciones asignadas a este proyecto"
          />
        </div>

        {/* Alertas de Presupuesto del Proyecto */}
        {(() => {
          const alerts: { category: string | null; budget: number; spent: number; pct: number }[] = [];
          // Alerta total
          if (stats.totalSpent > project.totalBudget && project.totalBudget > 0) {
            alerts.push({ category: null, budget: project.totalBudget, spent: stats.totalSpent, pct: Math.round((stats.totalSpent / project.totalBudget) * 100) });
          }
          // Alertas por categoría
          Object.keys(project.categoryBudgets).forEach(key => {
            const budget = (project.categoryBudgets as Record<string, number>)[key] || 0;
            const spent = spendingByCategory[key] || 0;
            if (budget > 0 && spent > budget) {
              alerts.push({ category: key, budget, spent, pct: Math.round((spent / budget) * 100) });
            }
          });

          return (
            <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Alertas de Presupuesto</h3>
              {alerts.length > 0 ? (
                <div className="space-y-2">
                  {alerts.map((a, i) => {
                    const catLabel = a.category
                      ? EXPENSE_CATEGORIES.find(c => c.key === a.category)?.label || a.category
                      : 'Presupuesto total';
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                        <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-800">{catLabel}</p>
                          <p className="text-xs text-red-600">€{formatCurrency(a.spent)} de €{formatCurrency(a.budget)}</p>
                        </div>
                        <span className="text-sm font-bold text-red-600">+{formatPercentage(a.pct - 100)} excedido</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
                  <CheckCircle2 size={18} className="text-green-500" />
                  <p className="text-sm font-medium text-green-700">Todo dentro de presupuesto</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Gauges - total + per category */}
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex flex-col items-center justify-center">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Presupuesto del Proyecto</h3>
            <GaugeChart
              total={project.totalBudget}
              spent={stats.totalSpent}
              label="Total"
            />
          </div>

          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Presupuesto vs Gasto</h3>
            <BudgetVsSpendingChart categoryStats={categoryStats} fixedByCategory={fixedByCategory} />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Fixed vs Variable breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Gastos Fijos vs Variables</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Total</p>
                  <p className="text-lg font-bold text-gray-900">&euro;{formatCurrency(stats.totalSpent)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Variables</p>
                  <p className="text-lg font-bold text-orange-600">&euro;{formatCurrency(variableTotal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Fijos</p>
                  <p className="text-lg font-bold text-blue-600">&euro;{formatCurrency(fixedTotal)}</p>
                </div>
              </div>
              {stats.totalSpent > 0 && (
                <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-orange-500 transition-all" style={{ width: `${(variableTotal / stats.totalSpent) * 100}%` }} />
                  <div className="bg-blue-500 transition-all" style={{ width: `${(fixedTotal / stats.totalSpent) * 100}%` }} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Categorías</h3>
              <CategoryProgressList
                categoryBudgets={project.categoryBudgets}
                spendingByCategory={spendingByCategory}
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Facturas ({invoiceCount})</h3>
              {invoiceCount === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
                  No hay facturas adjuntas todavía
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.filter(t => t.hasInvoice).slice(0, 10).map(t => (
                    <div
                      key={t.id}
                      onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.concept)}`)}
                      className="bg-white rounded-lg border border-gray-100 p-3 flex justify-between items-center cursor-pointer hover:border-amber-200 hover:shadow-sm transition-all"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.invoices?.[0]?.fileName || 'Factura'}</p>
                        <p className="text-xs text-gray-400">{t.concept}</p>
                      </div>
                      <span className="text-sm font-medium text-red-600">
                        €{formatCurrency(Math.abs(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-amber-50/50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:text-amber-700 select-none" onClick={() => handleTxSort('date')}>
                    Fecha<TxSortIcon column="date" />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:text-amber-700 select-none" onClick={() => handleTxSort('concept')}>
                    Concepto<TxSortIcon column="concept" />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right cursor-pointer hover:text-amber-700 select-none" onClick={() => handleTxSort('amount')}>
                    Importe<TxSortIcon column="amount" />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600">Categoría</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600">Factura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedTransactions.map(t => (
                  <tr
                    key={t.id}
                    className="hover:bg-amber-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.concept)}`)}
                  >
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{t.concept}</td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {t.amount < 0 ? '-' : '+'}€{formatCurrency(Math.abs(t.amount))}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {t.expenseCategory || '—'}
                    </td>
                    <td className="px-4 py-3">
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
            {transactions.length === 0 && (
              <div className="p-8 text-center text-gray-400">Sin transacciones en este proyecto</div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Construction size={48} className="mx-auto text-amber-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">Calendario</h3>
            <p className="text-gray-400 mt-2">Esta funcionalidad estará disponible próximamente</p>
          </div>
        )}
      </div>
    </div>
  );
}

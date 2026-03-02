import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Calendar, BarChart3, Table, Pencil, Trash2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { format, isBefore, isSameDay, startOfDay } from 'date-fns';
import clsx from 'clsx';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import CashFlowCalendar from '../components/CashFlowCalendar';
import CashFlowChart from '../components/CashFlowChart';
import CashFlowEntryModal from '../components/CashFlowEntryModal';
import CashFlowPlanModal from '../components/CashFlowPlanModal';
import { cashFlowAPI, projectAPI } from '../services/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import type {
  CashFlowEntry, CashFlowFilters, CashFlowSummaryMonth,
  CreateCashFlowData, UpdateCashFlowData, Project,
} from '../types';

type ActiveView = 'calendar' | 'chart' | 'table';

const VIEWS: { key: ActiveView; label: string; icon: typeof Calendar }[] = [
  { key: 'calendar', label: 'Calendario', icon: Calendar },
  { key: 'chart', label: 'Gráfico', icon: BarChart3 },
  { key: 'table', label: 'Tabla', icon: Table },
];

export default function CashFlow() {
  // Data
  const [entries, setEntries] = useState<CashFlowEntry[]>([]);
  const [allEntries, setAllEntries] = useState<CashFlowEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<CashFlowSummaryMonth[]>([]);
  const [stats, setStats] = useState({ totalIncome: 0, totalExpense: 0, net: 0 });

  // UI state
  const [activeView, setActiveView] = useState<ActiveView>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CashFlowEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Year selector
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Filters
  const [filters, setFilters] = useState<CashFlowFilters>({});

  // Effective filters: merge year boundaries + table filters
  const effectiveFilters = useMemo<CashFlowFilters>(() => {
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    return {
      ...filters,
      dateFrom: filters.dateFrom && filters.dateFrom > yearStart ? filters.dateFrom : yearStart,
      dateTo: filters.dateTo && filters.dateTo < yearEnd ? filters.dateTo : yearEnd,
    };
  }, [filters, selectedYear]);

  // Pagination (table)
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Version counter
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);

  const today = startOfDay(new Date());

  const filterKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);

  // ── Main data loading ──
  useEffect(() => {
    let cancelled = false;

    const doLoad = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [listRes, summaryRes] = await Promise.all([
          cashFlowAPI.list(effectiveFilters, pageSize, page * pageSize),
          cashFlowAPI.summary(effectiveFilters),
        ]);
        if (cancelled) return;
        setEntries(listRes.entries);
        setTotal(listRes.pagination.total);
        setStats(listRes.stats);
        setSummary(summaryRes.months);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Error al cargar datos');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    doLoad();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, pageSize, version]);

  useEffect(() => { setPage(0); }, [filterKey]);

  // ── Calendar entries ──
  useEffect(() => {
    let cancelled = false;

    const calendarFilters: CashFlowFilters = {
      dateFrom: `${selectedYear}-01-01`,
      dateTo: `${selectedYear}-12-31`,
    };
    if (filters.type) calendarFilters.type = filters.type;
    if (filters.projectId) calendarFilters.projectId = filters.projectId;

    cashFlowAPI.list(calendarFilters, 1000, 0)
      .then(res => { if (!cancelled) setAllEntries(res.entries); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [filters.type, filters.projectId, selectedYear, version]);

  // ── Load projects (once) ──
  useEffect(() => {
    projectAPI.listProjects()
      .then(res => setProjects(res.projects))
      .catch(() => {});
  }, []);

  // ── Mutations ──
  const handleEditSave = async (data: UpdateCashFlowData) => {
    if (selectedEntry) {
      await cashFlowAPI.update(selectedEntry.id, data);
    }
    reload();
  };

  const handleBatchSave = async (batchEntries: CreateCashFlowData[]) => {
    await cashFlowAPI.createBatch(batchEntries);
    reload();
  };

  const handleDelete = async (id: number) => {
    await cashFlowAPI.delete(id);
    reload();
  };

  // ── Handlers ──
  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setFilters(prev => ({ ...prev, dateFrom: dateStr, dateTo: dateStr }));
    setActiveView('table');
  };

  const handleEntryClick = (entry: CashFlowEntry) => {
    setSelectedEntry(entry);
    setIsEditModalOpen(true);
  };

  // Sync calendar month when year changes
  useEffect(() => {
    setCurrentMonth(new Date(selectedYear, 0, 1));
  }, [selectedYear]);

  const clearFilters = () => {
    setFilters(prev => ({ projectId: prev.projectId }));
  };

  const isRealized = (entry: CashFlowEntry) => {
    const entryDate = startOfDay(new Date(entry.date));
    return isBefore(entryDate, today) || isSameDay(entryDate, today);
  };

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flujo de Caja</h1>
            <p className="text-sm text-gray-500 mt-0.5">Previsiones de cobros y pagos</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Year selector */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
              <button onClick={() => setSelectedYear(y => y - 1)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-l-lg transition-colors" title="Año anterior">
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-sm font-semibold text-gray-800 min-w-[3rem] text-center">{selectedYear}</span>
              <button onClick={() => setSelectedYear(y => y + 1)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-r-lg transition-colors" title="Año siguiente">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Project filter */}
            <select
              value={filters.projectId || ''}
              onChange={e => setFilters(prev => ({ ...prev, projectId: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Todos los proyectos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <button onClick={() => setIsPlanModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
              <Plus size={16} />
              Nueva entrada
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <KPICard title="Total Cobros" value={`\u20AC${formatCurrency(stats.totalIncome)}`} icon={TrendingUp} color="green" />
          <KPICard title="Total Pagos" value={`\u20AC${formatCurrency(stats.totalExpense)}`} icon={TrendingDown} color="red" />
          <KPICard title="Flujo Neto"
            value={`${stats.net >= 0 ? '+' : '-'}\u20AC${formatCurrency(Math.abs(stats.net))}`}
            icon={Activity} color={stats.net >= 0 ? 'green' : 'red'} />
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-4 bg-white rounded-lg border border-gray-100 p-1 w-fit">
          {VIEWS.map(v => {
            const Icon = v.icon;
            return (
              <button key={v.key} onClick={() => setActiveView(v.key)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeView === v.key ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
                <Icon size={15} />
                {v.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Active View */}
        {activeView === 'calendar' && (
          <CashFlowCalendar entries={allEntries} currentMonth={currentMonth}
            onMonthChange={setCurrentMonth} onDateClick={handleDateClick} onEntryClick={handleEntryClick} />
        )}

        {activeView === 'chart' && <CashFlowChart summary={summary} />}

        {activeView === 'table' && (
          <div className="bg-white rounded-xl border border-gray-100">
            {/* Table filters */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-3">
                <select value={filters.type || ''}
                  onChange={e => setFilters(prev => ({ ...prev, type: (e.target.value as any) || undefined }))}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="">Todos los tipos</option>
                  <option value="INCOME">Cobros</option>
                  <option value="EXPENSE">Pagos</option>
                </select>

                <input type="date" value={filters.dateFrom || ''}
                  onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value || undefined }))}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                <input type="date" value={filters.dateTo || ''}
                  onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value || undefined }))}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />

                {(filters.dateFrom || filters.dateTo || filters.type) && (
                  <button onClick={clearFilters}
                    className="px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-amber-50/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Proyecto</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Importe</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-600" />
                          Cargando...
                        </div>
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        No hay entradas. Crea tu primera entrada de flujo de caja.
                      </td>
                    </tr>
                  ) : (
                    entries.map(entry => {
                      const realized = isRealized(entry);
                      return (
                        <tr key={entry.id} className={clsx('hover:bg-amber-50/30 transition-colors', realized && 'opacity-60')}>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatDate(entry.date)}</td>
                          <td className="px-4 py-3">
                            <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                              entry.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                              {entry.type === 'INCOME' ? 'Cobro' : 'Pago'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 max-w-[250px] truncate">{entry.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{entry.project?.name || '-'}</td>
                          <td className={clsx('px-4 py-3 text-sm font-medium text-right',
                            entry.type === 'INCOME' ? 'text-green-700' : 'text-red-700')}>
                            {entry.type === 'INCOME' ? '+' : '-'}&euro;{formatCurrency(entry.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                              realized ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700')}>
                              {realized ? 'Realizada' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleEntryClick(entry)}
                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar">
                                <Pencil size={14} />
                              </button>
                              {deleteConfirmId === entry.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={async () => { await handleDelete(entry.id); setDeleteConfirmId(null); }}
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Sí</button>
                                  <button onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">No</button>
                                </div>
                              ) : (
                                <button onClick={() => setDeleteConfirmId(entry.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(0); }}
                    className="px-2 py-1 border border-gray-200 rounded text-sm">
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-500">por página</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total}
                  </span>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= total}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit Modal (individual entry) */}
        <CashFlowEntryModal
          entry={selectedEntry}
          projects={projects}
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setSelectedEntry(null); }}
          onSave={handleEditSave}
          onDelete={handleDelete}
        />

        {/* Plan Wizard Modal (batch creation) */}
        <CashFlowPlanModal
          projects={projects}
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
          onSave={handleBatchSave}
        />
      </div>
    </div>
  );
}

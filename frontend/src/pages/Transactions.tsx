import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transactionAPI, projectAPI, invoiceAPI } from '../services/api';
import TransactionEditModal from '../components/TransactionEditModal';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/formatters';
import { ArrowDownUp, Archive, FileText, Search, X, Upload, Loader2, TrendingDown, TrendingUp, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import type {
  Transaction,
  TransactionFilters,
  UpdateTransactionData,
  Project,
  ExpenseCategory,
} from '../types';

type ViewTab = 'expenses' | 'income';

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read initial filters from URL query params
  const initialFilters = (): TransactionFilters => {
    const f: TransactionFilters = {};
    const hasInvoice = searchParams.get('hasInvoice');
    if (hasInvoice === 'false') f.hasInvoice = false;
    else if (hasInvoice === 'true') f.hasInvoice = true;
    const projectId = searchParams.get('projectId');
    if (projectId === 'none') f.projectId = -1; // sentinel for "no project"
    else if (projectId) f.projectId = parseInt(projectId);
    const search = searchParams.get('search');
    if (search) f.search = search;
    return f;
  };

  const [activeTab, setActiveTab] = useState<ViewTab>('expenses');
  const [filters, setFilters] = useState<TransactionFilters>({ ...initialFilters(), amountType: 'expense' });
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [amountInput, setAmountInput] = useState('');

  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalExpenses: 0, withoutInvoice: 0, unassigned: 0 });
  const [pageSize, setPageSize] = useState(50);

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<number | null>(null);

  // Estado para crear transacción manual
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createAmountType, setCreateAmountType] = useState<'expense' | 'income'>('expense');
  const [createForm, setCreateForm] = useState({
    date: '', amount: '', concept: '',
    projectId: '' as string, expenseCategory: '' as string, notes: '', isFixed: false,
  });
  const [createInvoiceFile, setCreateInvoiceFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters, currentPage, pageSize]);

  const loadProjects = async () => {
    try {
      const response = await projectAPI.listProjects();
      setProjects(response.projects);
    } catch (err) {
      console.error('Error al cargar proyectos:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const effectiveLimit = pageSize === 0 ? 10000 : pageSize;
      const response = await transactionAPI.listTransactions(filters, effectiveLimit, currentPage * effectiveLimit);
      setTransactions(response.transactions);
      setHasMore(response.pagination.hasMore);
      setTotal(response.pagination.total);
      setStats(response.stats);
    } catch (err) {
      setError('Error al cargar las transacciones');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: keyof TransactionFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setCurrentPage(0);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange('search', searchInput);
  };

  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleSave = async (id: number, data: UpdateTransactionData) => {
    await transactionAPI.updateTransaction(id, data);
    await loadTransactions();
  };

  const handleArchive = async (transaction: Transaction) => {
    const action = transaction.isArchived ? 'desarchivar' : 'archivar';
    if (!window.confirm(`¿${transaction.isArchived ? 'Desarchivar' : 'Archivar'} esta transacción?\n\n${transaction.concept}`)) return;
    try {
      await transactionAPI.archiveTransaction(transaction.id);
      await loadTransactions();
    } catch (err) {
      alert(`Error al ${action} la transacción`);
      console.error(err);
    }
  };

  const handleInlineProjectChange = async (transactionId: number, value: string) => {
    try {
      const projectId = value ? parseInt(value) : null;
      await transactionAPI.updateTransaction(transactionId, { projectId });
      await loadTransactions();
    } catch (err) {
      console.error('Error al cambiar proyecto:', err);
    }
  };

  const handleInlineCategoryChange = async (transactionId: number, value: string) => {
    try {
      const expenseCategory = (value as ExpenseCategory) || null;
      await transactionAPI.updateTransaction(transactionId, { expenseCategory });
      await loadTransactions();
    } catch (err) {
      console.error('Error al cambiar categoría:', err);
    }
  };

  const handleInlineInvoiceUpload = async (transactionId: number, file: File) => {
    try {
      setUploadingInvoiceId(transactionId);
      await invoiceAPI.uploadInvoice(transactionId, file);
      await loadTransactions();
    } catch (err) {
      alert('Error al subir la factura');
      console.error('Error al subir factura:', err);
    } finally {
      setUploadingInvoiceId(null);
    }
  };

  const handleInlineFixedToggle = async (transactionId: number, currentValue: boolean) => {
    try {
      await transactionAPI.updateTransaction(transactionId, { isFixed: !currentValue });
      await loadTransactions();
    } catch (err) {
      console.error('Error al cambiar tipo de gasto:', err);
    }
  };

  const handleAmountFilterApply = () => {
    const val = amountInput ? parseFloat(amountInput) : undefined;
    setFilters(prev => ({
      ...prev,
      amountMin: val,
      amountMax: val,
    }));
    setCurrentPage(0);
  };

  const clearFilters = () => {
    setFilters({ amountType: activeTab === 'expenses' ? 'expense' : 'income' });
    setSearchInput('');
    setAmountInput('');
    setCurrentPage(0);
  };


  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    setFilters({ amountType: tab === 'expenses' ? 'expense' : 'income' });
    setSearchInput('');
    setAmountInput('');
    setCurrentPage(0);
  };

  const handleRowClick = (e: React.MouseEvent, transaction: Transaction) => {
    const target = e.target as HTMLElement;
    if (target.closest('select, button, input, label, a')) return;
    handleEdit(transaction);
  };

  // Importe a mostrar: asignado al proyecto filtrado si aplica, si no el total
  const getDisplayAmount = (t: Transaction): number => {
    if (filters.projectId && filters.projectId > 0 && t.allocations?.length) {
      const alloc = t.allocations.find(a => a.projectId === filters.projectId);
      if (alloc) return alloc.amount;
    }
    return t.amount;
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmount = parseFloat(createForm.amount);
    if (!createForm.date || isNaN(rawAmount) || rawAmount <= 0 || !createForm.concept.trim()) {
      setCreateError('Todos los campos son obligatorios (importe debe ser positivo)');
      return;
    }
    const amount = createAmountType === 'expense' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    try {
      setIsCreating(true);
      setCreateError(null);
      const { transaction: created } = await transactionAPI.createTransaction({
        date: createForm.date,
        amount,
        concept: createForm.concept.trim(),
        projectId: createForm.projectId ? parseInt(createForm.projectId) : null,
        expenseCategory: (createForm.expenseCategory as ExpenseCategory) || null,
        notes: createForm.notes || null,
        isFixed: createForm.isFixed,
      });
      // Si hay factura adjunta, subirla
      if (createInvoiceFile) {
        try {
          await invoiceAPI.uploadInvoice(created.id, createInvoiceFile);
        } catch (invoiceErr) {
          console.error('Transacción creada pero error al subir factura:', invoiceErr);
        }
      }
      setShowCreateModal(false);
      setCreateForm({ date: '', amount: '', concept: '', projectId: '', expenseCategory: '', notes: '', isFixed: false });
      setCreateAmountType('expense');
      setCreateInvoiceFile(null);
      // Ir a página 1 y cambiar al tab correcto para ver la nueva transacción
      const newTab: ViewTab = createAmountType === 'expense' ? 'expenses' : 'income';
      if (activeTab !== newTab) {
        setActiveTab(newTab);
        setFilters({ amountType: newTab === 'expenses' ? 'expense' : 'income' });
      }
      setCurrentPage(0);
      await loadTransactions();
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear la transacción');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSort = (column: 'date' | 'amount' | 'concept') => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
    setCurrentPage(0);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (filters.sortBy !== column) return null;
    return filters.sortOrder === 'asc'
      ? <ArrowUp size={12} className="inline ml-1" />
      : <ArrowDown size={12} className="inline ml-1" />;
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => k !== 'amountType' && k !== 'sortBy' && k !== 'sortOrder' && v !== undefined);

  const { totalExpenses, withoutInvoice, unassigned } = stats;

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transacciones</h1>
            <p className="text-gray-500 text-sm mt-1">Gestiona y asigna las transacciones bancarias</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
          >
            <Plus size={18} />
            Nueva transacción
          </button>
        </div>

        {/* Tabs: Gastos / Ingresos */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          <button
            onClick={() => handleTabChange('expenses')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'expenses'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <TrendingDown size={16} />
            Gastos
          </button>
          <button
            onClick={() => handleTabChange('income')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'income'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <TrendingUp size={16} />
            Ingresos
          </button>
        </div>

        {/* KPIs - solo para gastos */}
        {activeTab === 'expenses' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <KPICard
              title="Total Gastos"
              value={total}
              subtitle={`Página ${currentPage + 1}`}
              icon={ArrowDownUp}
              color="amber"
            />
            <KPICard
              title="Gastado Total"
              value={`€${formatCurrency(totalExpenses)}`}
              subtitle="Suma de gastos"
              color={totalExpenses > 0 ? 'red' : 'green'}
            />
            <KPICard
              title="Sin Factura"
              value={withoutInvoice}
              subtitle="Gastos sin factura"
              icon={FileText}
              color={withoutInvoice > 0 ? 'red' : 'green'}
            />
            <KPICard
              title="Sin Proyecto"
              value={unassigned}
              subtitle="Gastos sin asignar"
              color={unassigned > 0 ? 'amber' : 'green'}
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
            <select
              value={filters.projectId === -1 ? 'none' : (filters.projectId || '')}
              onChange={e => {
                const val = e.target.value;
                if (val === 'none') handleFilterChange('projectId', -1);
                else handleFilterChange('projectId', val ? parseInt(val) : undefined);
              }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Todos los proyectos</option>
              <option value="none">Sin proyecto</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {activeTab === 'expenses' && (
              <select
                value={filters.expenseCategory || ''}
                onChange={e => handleFilterChange('expenseCategory', e.target.value as ExpenseCategory)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Todas las categorías</option>
                {EXPENSE_CATEGORIES.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            )}

            {activeTab === 'expenses' && (
              <select
                value={filters.hasInvoice === undefined ? '' : filters.hasInvoice.toString()}
                onChange={e => handleFilterChange('hasInvoice', e.target.value === '' ? undefined : e.target.value === 'true')}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Todas</option>
                <option value="true">Con factura</option>
                <option value="false">Sin factura</option>
              </select>
            )}

            <select
              value={filters.isArchived || ''}
              onChange={e => handleFilterChange('isArchived', e.target.value || undefined)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Activas</option>
              <option value="true">Archivadas</option>
              <option value="all">Todas</option>
            </select>

            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Buscar concepto..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={e => {
                const val = e.target.value;
                setFilters(prev => ({ ...prev, dateFrom: val || undefined, dateTo: val || undefined }));
                setCurrentPage(0);
              }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Fecha exacta"
            />
            {activeTab === 'expenses' && (
              <select
                value={filters.isFixed === undefined ? '' : filters.isFixed.toString()}
                onChange={e => handleFilterChange('isFixed', e.target.value === '' ? undefined : e.target.value === 'true')}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Fijos y Variables</option>
                <option value="true">Solo Fijos</option>
                <option value="false">Solo Variables</option>
              </select>
            )}
            {activeTab === 'expenses' && (
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={e => setAmountInput(e.target.value)}
                onBlur={handleAmountFilterApply}
                onKeyDown={e => e.key === 'Enter' && handleAmountFilterApply()}
                placeholder="Importe exacto €"
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            )}
            <select
              value={filters.sortBy && filters.sortOrder ? `${filters.sortBy}-${filters.sortOrder}` : ''}
              onChange={e => {
                const val = e.target.value;
                if (!val) {
                  setFilters(prev => ({ ...prev, sortBy: undefined, sortOrder: undefined }));
                } else {
                  const [sortBy, sortOrder] = val.split('-') as ['date' | 'amount', 'asc' | 'desc'];
                  setFilters(prev => ({ ...prev, sortBy, sortOrder }));
                }
                setCurrentPage(0);
              }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Ordenar por...</option>
              <option value="date-desc">Fecha: Más reciente</option>
              <option value="date-asc">Fecha: Más antigua</option>
              <option value="amount-desc">Importe: Mayor</option>
              <option value="amount-asc">Importe: Menor</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center justify-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                <X size={14} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Pagination - above table */}
        {!isLoading && !error && transactions.length > 0 && (
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">
                {pageSize === 0
                  ? `${transactions.length} transacciones`
                  : `${currentPage * pageSize + 1}–${currentPage * pageSize + transactions.length} de ${total}`
                }
              </p>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
                <option value={0}>Todas</option>
              </select>
            </div>
            {pageSize > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 0}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!hasMore}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600 font-medium">{error}</p>
              <button onClick={loadTransactions} className="mt-3 text-amber-600 hover:underline text-sm">
                Reintentar
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <ArrowDownUp size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-600 font-medium">No hay transacciones</p>
              <p className="text-gray-400 text-sm mt-1">Ajusta los filtros o espera a la sincronización</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-amber-50/50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:text-amber-700 select-none" onClick={() => handleSort('date')}>
                      Fecha<SortIcon column="date" />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:text-amber-700 select-none" onClick={() => handleSort('concept')}>
                      Concepto<SortIcon column="concept" />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right cursor-pointer hover:text-amber-700 select-none" onClick={() => handleSort('amount')}>
                      Importe<SortIcon column="amount" />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600">Proyecto</th>
                    {activeTab === 'expenses' && (
                      <>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600">Categoría</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Factura</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Tipo</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map(t => (
                    <tr key={t.id} onClick={(e) => handleRowClick(e, t)} className="hover:bg-amber-50/30 transition-colors cursor-pointer">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800 truncate max-w-xs">{t.concept}</p>
                        <p className="text-xs text-gray-400">{t.category}</p>
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${getDisplayAmount(t) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {getDisplayAmount(t) < 0 ? '-' : '+'}€{formatCurrency(Math.abs(getDisplayAmount(t)))}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {t.allocations && t.allocations.length > 1 ? (
                          <button
                            onClick={() => handleEdit(t)}
                            className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                            title={t.allocations.map(a => a.project?.name || `Proyecto ${a.projectId}`).join(', ')}
                          >
                            {t.allocations.length} proyectos
                          </button>
                        ) : (
                          <select
                            value={t.allocations?.[0]?.projectId || t.projectId || ''}
                            onChange={e => handleInlineProjectChange(t.id, e.target.value)}
                            className="bg-transparent border-0 text-sm text-gray-800 cursor-pointer hover:bg-amber-50 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white max-w-[160px]"
                          >
                            <option value="" className="text-gray-400">Sin asignar</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {activeTab === 'expenses' && (
                        <>
                          <td className="px-4 py-3">
                            <select
                              value={t.expenseCategory || ''}
                              onChange={e => handleInlineCategoryChange(t.id, e.target.value)}
                              className="bg-transparent border-0 text-xs font-medium text-amber-800 cursor-pointer hover:bg-amber-50 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white max-w-[180px]"
                            >
                              <option value="" className="text-gray-400">Sin categoría</option>
                              {EXPENSE_CATEGORIES.map(cat => (
                                <option key={cat.key} value={cat.key}>{cat.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              {t.hasInvoice ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                  {t.invoices?.length || 1}
                                </span>
                              ) : null}
                              {uploadingInvoiceId === t.id ? (
                                <Loader2 size={16} className="inline animate-spin text-amber-600" />
                              ) : (
                                <label className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                                  t.hasInvoice
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                }`}>
                                  {t.hasInvoice ? '+' : 'No'}
                                  <Upload size={12} />
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (file) handleInlineInvoiceUpload(t.id, file);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleInlineFixedToggle(t.id, t.isFixed)}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                t.isFixed
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {t.isFixed ? 'Fijo' : 'Variable'}
                            </button>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleEdit(t)}
                            className="text-amber-600 hover:text-amber-700 text-sm px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleArchive(t)}
                            className={`text-sm px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                              t.isArchived
                                ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                : 'text-gray-500 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <Archive size={14} />
                            {t.isArchived ? 'Desarchivar' : 'Archivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modal edición */}
      {selectedTransaction && (
        <TransactionEditModal
          transaction={selectedTransaction}
          projects={projects}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Modal crear transacción manual */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="bg-amber-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nueva Transacción Manual</h2>
              <button onClick={() => { setShowCreateModal(false); setCreateError(null); setCreateInvoiceFile(null); }} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTransaction} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="date"
                  value={createForm.date}
                  onChange={e => setCreateForm(prev => ({ ...prev, date: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateAmountType('expense')}
                    className={clsx(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                      createAmountType === 'expense'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    Gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateAmountType('income')}
                    className={clsx(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                      createAmountType === 'income'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    Ingreso
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={createForm.amount}
                  onChange={e => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="Ej: 150.00"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto / Proveedor</label>
                <input
                  type="text"
                  value={createForm.concept}
                  onChange={e => setCreateForm(prev => ({ ...prev, concept: e.target.value }))}
                  placeholder="Ej: Ferretería López"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
                <select
                  value={createForm.projectId}
                  onChange={e => setCreateForm(prev => ({ ...prev, projectId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría de gasto</label>
                <select
                  value={createForm.expenseCategory}
                  onChange={e => setCreateForm(prev => ({ ...prev, expenseCategory: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Sin categoría</option>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Si vacío y el concepto ya existe, se hereda automáticamente</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de gasto</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateForm(prev => ({ ...prev, isFixed: false }))}
                    className={clsx(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                      !createForm.isFixed
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    Variable
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateForm(prev => ({ ...prev, isFixed: true }))}
                    className={clsx(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                      createForm.isFixed
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    Fijo
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={createForm.notes}
                  onChange={e => setCreateForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Factura (opcional)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setCreateInvoiceFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />
                {createInvoiceFile && (
                  <p className="text-xs text-amber-600 mt-1">{createInvoiceFile.name}</p>
                )}
              </div>
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(null); setCreateInvoiceFile(null); }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50"
                >
                  {isCreating ? 'Creando...' : 'Crear Transacción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

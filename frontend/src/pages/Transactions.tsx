import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transactionAPI, projectAPI, invoiceAPI } from '../services/api';
import TransactionEditModal from '../components/TransactionEditModal';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/formatters';
import { ArrowDownUp, Archive, FileText, Search, X, Upload, Loader2 } from 'lucide-react';
import type {
  Transaction,
  TransactionFilters,
  UpdateTransactionData,
  Project,
  ExpenseCategory,
} from '../types';

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

  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [amountMinInput, setAmountMinInput] = useState('');
  const [amountMaxInput, setAmountMaxInput] = useState('');

  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalAmount: 0, withoutInvoice: 0, unassigned: 0 });
  const LIMIT = 50;

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters, currentPage]);

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
      const response = await transactionAPI.listTransactions(filters, LIMIT, currentPage * LIMIT);
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
    setFilters(prev => ({
      ...prev,
      amountMin: amountMinInput ? parseFloat(amountMinInput) : undefined,
      amountMax: amountMaxInput ? parseFloat(amountMaxInput) : undefined,
    }));
    setCurrentPage(0);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchInput('');
    setAmountMinInput('');
    setAmountMaxInput('');
    setCurrentPage(0);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined);

  const { totalAmount, withoutInvoice, unassigned } = stats;

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Transacciones</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona y asigna las transacciones bancarias</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="Total Resultados"
            value={total}
            subtitle={`Página ${currentPage + 1}`}
            icon={ArrowDownUp}
            color="amber"
          />
          <KPICard
            title="Importe Total"
            value={`€${formatCurrency(Math.abs(totalAmount))}`}
            subtitle={totalAmount < 0 ? 'Gasto neto' : 'Ingreso neto'}
            color={totalAmount < 0 ? 'red' : 'green'}
          />
          <KPICard
            title="Sin Factura"
            value={withoutInvoice}
            subtitle="Gastos sin factura"
            icon={FileText}
            color={withoutInvoice > 0 ? 'red' : 'green'}
          />
          <KPICard
            title="Sin Asignar"
            value={unassigned}
            subtitle="Sin proyecto asignado"
            color={unassigned > 0 ? 'amber' : 'green'}
          />
        </div>

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

            <select
              value={filters.hasInvoice === undefined ? '' : filters.hasInvoice.toString()}
              onChange={e => handleFilterChange('hasInvoice', e.target.value === '' ? undefined : e.target.value === 'true')}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Todas</option>
              <option value="true">Con factura</option>
              <option value="false">Sin factura</option>
            </select>

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
              onChange={e => handleFilterChange('dateFrom', e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Desde"
            />
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={e => handleFilterChange('dateTo', e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Hasta"
            />
            <select
              value={filters.isFixed === undefined ? '' : filters.isFixed.toString()}
              onChange={e => handleFilterChange('isFixed', e.target.value === '' ? undefined : e.target.value === 'true')}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Fijos y Variables</option>
              <option value="true">Solo Fijos</option>
              <option value="false">Solo Variables</option>
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amountMinInput}
                onChange={e => setAmountMinInput(e.target.value)}
                onBlur={handleAmountFilterApply}
                onKeyDown={e => e.key === 'Enter' && handleAmountFilterApply()}
                placeholder="Min €"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="text"
                inputMode="decimal"
                value={amountMaxInput}
                onChange={e => setAmountMaxInput(e.target.value)}
                onBlur={handleAmountFilterApply}
                onKeyDown={e => e.key === 'Enter' && handleAmountFilterApply()}
                placeholder="Max €"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
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
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600">Concepto</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Importe</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600">Proyecto</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600">Categoría</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Factura</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Tipo</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800 truncate max-w-xs">{t.concept}</p>
                        <p className="text-xs text-gray-400">{t.category}</p>
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {t.amount < 0 ? '-' : '+'}€{formatCurrency(Math.abs(t.amount))}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={t.projectId || ''}
                          onChange={e => handleInlineProjectChange(t.id, e.target.value)}
                          className="bg-transparent border-0 text-sm text-gray-800 cursor-pointer hover:bg-amber-50 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white max-w-[160px]"
                        >
                          <option value="" className="text-gray-400">Sin asignar</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
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
                        {t.hasInvoice ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sí</span>
                        ) : uploadingInvoiceId === t.id ? (
                          <Loader2 size={16} className="inline animate-spin text-amber-600" />
                        ) : (
                          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 cursor-pointer hover:bg-red-200 transition-colors">
                            No
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

        {/* Pagination */}
        {!isLoading && !error && transactions.length > 0 && (
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-gray-500">
              {currentPage * LIMIT + 1}–{currentPage * LIMIT + transactions.length} de {total}
            </p>
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
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedTransaction && (
        <TransactionEditModal
          transaction={selectedTransaction}
          projects={projects}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { transactionAPI, projectAPI } from '../services/api';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/formatters';
import type { Transaction, Project, ExpenseCategory, TransactionFilters } from '../types';

interface TransactionSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (transactionId: number) => void;
  linking: number | null;
  initialSearch?: string;
  initialAmount?: number;
  initialDate?: string;
}

const PAGE_SIZE = 50;

export default function TransactionSearchModal({
  isOpen,
  onClose,
  onLink,
  linking,
  initialSearch,
  initialAmount,
  initialDate,
}: TransactionSearchModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Filters
  const [search, setSearch] = useState(initialSearch || '');
  const [projectId, setProjectId] = useState<number | undefined>();
  const [category, setCategory] = useState<ExpenseCategory | undefined>();
  const [dateFrom, setDateFrom] = useState(() => {
    if (!initialDate) return '';
    const d = new Date(initialDate);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    if (!initialDate) return '';
    const d = new Date(initialDate);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [amountInput, setAmountInput] = useState(initialAmount ? initialAmount.toFixed(2) : '');
  const [sortBy, setSortBy] = useState<string>('');

  // Load projects on mount
  useEffect(() => {
    projectAPI.listProjects().then(res => setProjects(res.projects)).catch(() => {});
  }, []);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: TransactionFilters = {
        isArchived: 'false',
        amountType: 'expense',
      };
      if (search.trim()) filters.search = search.trim();
      if (projectId !== undefined) filters.projectId = projectId;
      if (category) filters.expenseCategory = category;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      // Amount filter: create a range ±10% around the entered amount
      if (amountInput.trim()) {
        const amt = parseFloat(amountInput);
        if (!isNaN(amt) && amt > 0) {
          filters.amountMin = Math.round(amt * 0.9 * 100) / 100;
          filters.amountMax = Math.round(amt * 1.1 * 100) / 100;
        }
      }

      if (sortBy) {
        const [sb, so] = sortBy.split('-') as ['date' | 'amount', 'asc' | 'desc'];
        filters.sortBy = sb;
        filters.sortOrder = so;
      }

      const res = await transactionAPI.listTransactions(filters, PAGE_SIZE, currentPage * PAGE_SIZE);
      setTransactions(res.transactions);
      setTotal(res.pagination.total);
    } catch (err) {
      console.error('Error searching transactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, projectId, category, dateFrom, dateTo, amountInput, sortBy, currentPage]);

  // Fetch on filter changes (debounced for search)
  useEffect(() => {
    const timer = setTimeout(fetchTransactions, 300);
    return () => clearTimeout(timer);
  }, [fetchTransactions]);

  const clearFilters = () => {
    setSearch('');
    setProjectId(undefined);
    setCategory(undefined);
    setDateFrom('');
    setDateTo('');
    setAmountInput('');
    setSortBy('');
    setCurrentPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50 rounded-t-xl">
          <h2 className="text-lg font-bold text-gray-800">Buscar transaccion para vincular</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="relative col-span-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(0); }}
                placeholder="Buscar por concepto..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
            </div>
            <select
              value={projectId ?? ''}
              onChange={(e) => { setProjectId(e.target.value ? parseInt(e.target.value) : undefined); setCurrentPage(0); }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Todos los proyectos</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={category ?? ''}
              onChange={(e) => { setCategory((e.target.value || undefined) as ExpenseCategory | undefined); setCurrentPage(0); }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Todas las categorias</option>
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(0); }}
              placeholder="Desde"
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(0); }}
              placeholder="Hasta"
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setCurrentPage(0); }}
              placeholder="Importe aprox..."
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(0); }}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Ordenar por...</option>
                <option value="date-desc">Fecha: Reciente</option>
                <option value="date-asc">Fecha: Antigua</option>
                <option value="amount-desc">Importe: Mayor</option>
                <option value="amount-asc">Importe: Menor</option>
              </select>
              <button
                onClick={clearFilters}
                className="px-2 py-2 text-xs text-amber-600 hover:text-amber-700 whitespace-nowrap"
                title="Limpiar filtros"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin" /> Buscando...
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Sin resultados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                  <th className="pb-2 pr-2">Fecha</th>
                  <th className="pb-2 pr-2">Concepto</th>
                  <th className="pb-2 pr-2 text-right">Importe</th>
                  <th className="pb-2 pr-2">Proyecto</th>
                  <th className="pb-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                    <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="py-2 pr-2 text-gray-800 max-w-[240px] truncate">{t.concept}</td>
                    <td className="py-2 pr-2 text-right font-medium text-gray-800 whitespace-nowrap">
                      {formatCurrency(Math.abs(t.amount))}
                    </td>
                    <td className="py-2 pr-2 text-gray-500 truncate max-w-[120px]">
                      {t.project?.name || '—'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onLink(t.id)}
                        disabled={linking !== null}
                        className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg disabled:opacity-50 transition-colors"
                        title="Vincular"
                      >
                        {linking === t.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>{total} transacciones</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1 hover:text-amber-600 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <span>{currentPage + 1} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="p-1 hover:text-amber-600 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

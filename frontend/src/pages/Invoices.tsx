import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionAPI, projectAPI, invoiceAPI } from '../services/api';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import BulkUploadZone from '../components/BulkUploadZone';
import OrphanInvoiceCard from '../components/OrphanInvoiceCard';
import { formatCurrency, formatDate } from '../lib/formatters';
import { FileText, DollarSign, Search, ExternalLink, Upload, AlertTriangle, Loader2 } from 'lucide-react';
import type { Transaction, Project, OrphanInvoice, OcrBudgetStatus, OcrStatus } from '../types';

type Tab = 'invoices' | 'orphans' | 'upload';

export default function Invoices() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('invoices');

  // Budget state (shared across tabs)
  const [budget, setBudget] = useState<OcrBudgetStatus | null>(null);

  // Tab 1: Invoices
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();

  // Tab 2: Orphans
  const [orphans, setOrphans] = useState<OrphanInvoice[]>([]);
  const [orphanTotal, setOrphanTotal] = useState(0);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [orphanSearch, setOrphanSearch] = useState('');
  const [orphanStatusFilter, setOrphanStatusFilter] = useState<OcrStatus | ''>('');

  // Load budget
  useEffect(() => {
    invoiceAPI.getOcrBudget().then(setBudget).catch(console.error);
  }, []);

  // Load projects once
  useEffect(() => {
    projectAPI.listProjects().then(res => setProjects(res.projects)).catch(console.error);
  }, []);

  // Tab 1 data
  useEffect(() => {
    loadInvoiceData();
  }, [filterProjectId, search]);

  const loadInvoiceData = async () => {
    try {
      setIsLoading(true);
      const res = await transactionAPI.listTransactions(
        { hasInvoice: true, projectId: filterProjectId, search: search || undefined },
        200,
        0
      );
      setTransactions(res.transactions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Tab 2 data
  const loadOrphans = useCallback(async () => {
    setOrphanLoading(true);
    try {
      const filters: { ocrStatus?: OcrStatus; search?: string } = {};
      if (orphanStatusFilter) filters.ocrStatus = orphanStatusFilter;
      if (orphanSearch) filters.search = orphanSearch;
      const res = await invoiceAPI.listOrphans(filters, 50, 0);
      setOrphans(res.invoices);
      setOrphanTotal(res.pagination.total);
    } catch (err) {
      console.error(err);
    } finally {
      setOrphanLoading(false);
    }
  }, [orphanStatusFilter, orphanSearch]);

  useEffect(() => {
    if (activeTab === 'orphans') {
      loadOrphans();
    }
  }, [activeTab, loadOrphans]);

  const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Budget bar
  const budgetPercent = budget && budget.budgetCents > 0 ? Math.min(100, (budget.spentCents / budget.budgetCents) * 100) : 0;
  const budgetBarColor = budgetPercent >= 80 ? 'bg-red-500' : budgetPercent >= 50 ? 'bg-amber-500' : 'bg-green-500';

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'invoices', label: 'Facturas' },
    { key: 'orphans', label: 'Huerfanas', count: orphanTotal },
    { key: 'upload', label: 'Subir' },
  ];

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Facturas</h1>

        {/* OCR Budget Bar */}
        {budget && budget.budgetCents > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Presupuesto OCR mensual</span>
              <span className="text-sm text-gray-500">
                ${formatCurrency(budget.spentCents / 100)} / ${formatCurrency(budget.budgetCents / 100)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${budgetBarColor}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            {budgetPercent >= 90 && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={12} />
                {budgetPercent >= 100
                  ? 'Presupuesto agotado. Las nuevas facturas se guardaran sin OCR.'
                  : 'Presupuesto casi agotado.'}
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab 1: Facturas (existing) */}
        {activeTab === 'invoices' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <KPICard title="Total Facturas" value={transactions.length} icon={FileText} color="amber" />
              <KPICard title="Importe Total" value={`${formatCurrency(totalAmount)}`} icon={DollarSign} color="green" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por empresa o concepto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <select
                value={filterProjectId || ''}
                onChange={e => setFilterProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Todos los proyectos</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600">Sin facturas</h3>
                <p className="text-gray-400 mt-2">No hay facturas que coincidan con los filtros</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-amber-50/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Fecha</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Concepto</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Archivo</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600">Proyecto</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Importe</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map(t => (
                      <tr key={t.id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(t.date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{t.concept}</td>
                        <td className="px-4 py-3 text-sm text-amber-600">{t.invoices?.map(i => i.fileName).join(', ') || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{t.project?.name || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-right text-red-600">
                          {formatCurrency(Math.abs(t.amount))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.concept)}`)}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium hover:underline"
                          >
                            <ExternalLink size={13} /> Ver transaccion
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Orphans */}
        {activeTab === 'orphans' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o proveedor..."
                  value={orphanSearch}
                  onChange={e => setOrphanSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <select
                value={orphanStatusFilter}
                onChange={e => setOrphanStatusFilter(e.target.value as OcrStatus | '')}
                className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Todos los estados</option>
                <option value="COMPLETED">OCR Completado</option>
                <option value="FAILED">OCR Fallido</option>
                <option value="BUDGET_EXCEEDED">Sin presupuesto</option>
                <option value="PENDING">Pendiente</option>
              </select>
            </div>

            {orphanLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={32} className="animate-spin text-amber-600" />
              </div>
            ) : orphans.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600">Sin facturas huerfanas</h3>
                <p className="text-gray-400 mt-2">
                  Sube facturas en la pestana "Subir" para empezar a vincularlas
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orphans.map(inv => (
                  <OrphanInvoiceCard
                    key={inv.id}
                    invoice={inv}
                    onLinked={() => {
                      loadOrphans();
                      loadInvoiceData();
                    }}
                    onDeleted={loadOrphans}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 3: Upload */}
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Upload size={20} className="text-amber-600" />
                <h2 className="text-lg font-medium text-gray-800">Subida masiva de facturas</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Sube hasta 10 facturas a la vez. Se analizaran automaticamente con OCR para extraer
                importe, fecha, proveedor y numero de factura. Luego podras vincularlas a transacciones.
              </p>
              <BulkUploadZone
                onUploadComplete={() => {
                  loadOrphans();
                  invoiceAPI.getOcrBudget().then(setBudget).catch(console.error);
                }}
                budget={budget}
                onBudgetUpdate={setBudget}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

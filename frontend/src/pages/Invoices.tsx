import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionAPI, projectAPI } from '../services/api';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import { formatCurrency, formatDate } from '../lib/formatters';
import { FileText, DollarSign, Search, ExternalLink } from 'lucide-react';
import type { Transaction, Project } from '../types';

export default function Invoices() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();

  useEffect(() => {
    loadData();
  }, [filterProjectId, search]);

  useEffect(() => {
    projectAPI.listProjects().then(res => setProjects(res.projects));
  }, []);

  const loadData = async () => {
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

  const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Facturas</h1>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <KPICard title="Total Facturas" value={transactions.length} icon={FileText} color="amber" />
          <KPICard title="Importe Total" value={`€${formatCurrency(totalAmount)}`} icon={DollarSign} color="green" />
        </div>

        {/* Filters */}
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

        {/* Table */}
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(t => (
                  <tr key={t.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{t.concept}</td>
                    <td className="px-4 py-3 text-sm text-amber-600">{t.invoices?.map(i => i.fileName).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.project?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-right text-red-600">
                      €{formatCurrency(Math.abs(t.amount))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.concept)}`)}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium hover:underline"
                      >
                        <ExternalLink size={13} /> Ver transacción
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

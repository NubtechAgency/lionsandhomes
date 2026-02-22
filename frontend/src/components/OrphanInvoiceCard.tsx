import { useState, useEffect } from 'react';
import { Check, X, Edit3, Save, Search, FileText, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { invoiceAPI, transactionAPI } from '../services/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import type { OrphanInvoice, MatchSuggestion, Transaction, OcrStatus } from '../types';

interface OrphanInvoiceCardProps {
  invoice: OrphanInvoice;
  onLinked: () => void;
  onDeleted: () => void;
}

const OCR_STATUS_BADGE: Record<OcrStatus, { label: string; color: string }> = {
  NONE: { label: 'Sin OCR', color: 'bg-gray-100 text-gray-600' },
  PENDING: { label: 'Pendiente', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Procesando', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Error', color: 'bg-red-100 text-red-700' },
  BUDGET_EXCEEDED: { label: 'Sin presupuesto', color: 'bg-amber-100 text-amber-700' },
};

export default function OrphanInvoiceCard({ invoice, onLinked, onDeleted }: OrphanInvoiceCardProps) {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    ocrAmount: invoice.ocrAmount ?? undefined as number | undefined,
    ocrDate: invoice.ocrDate ? invoice.ocrDate.split('T')[0] : '',
    ocrVendor: invoice.ocrVendor ?? '',
    ocrInvoiceNumber: invoice.ocrInvoiceNumber ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Manual search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Transaction[]>([]);
  const [searching, setSearching] = useState(false);

  const loadSuggestions = async () => {
    if (invoice.ocrStatus !== 'COMPLETED') return;
    setLoadingSuggestions(true);
    try {
      const res = await invoiceAPI.getSuggestions(invoice.id);
      setSuggestions(res.suggestions);
    } catch (err) {
      console.error('Error loading suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [invoice.id]);

  const handleSaveOcr = async () => {
    setSaving(true);
    try {
      const data: any = {};
      if (editData.ocrAmount !== undefined) data.ocrAmount = editData.ocrAmount;
      if (editData.ocrDate) data.ocrDate = editData.ocrDate;
      if (editData.ocrVendor) data.ocrVendor = editData.ocrVendor;
      if (editData.ocrInvoiceNumber) data.ocrInvoiceNumber = editData.ocrInvoiceNumber;

      const res = await invoiceAPI.updateOcrData(invoice.id, data);
      setSuggestions(res.suggestions);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving OCR data:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async (transactionId: number) => {
    setLinking(transactionId);
    try {
      await invoiceAPI.linkToTransaction(invoice.id, transactionId);
      onLinked();
    } catch (err) {
      console.error('Error linking invoice:', err);
    } finally {
      setLinking(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Eliminar esta factura permanentemente?')) return;
    setDeleting(true);
    try {
      await invoiceAPI.deleteInvoice(invoice.id);
      onDeleted();
    } catch (err) {
      console.error('Error deleting invoice:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await transactionAPI.listTransactions(
        { search: searchQuery, isArchived: 'false' },
        20,
        0
      );
      setSearchResults(res.transactions);
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setSearching(false);
    }
  };

  const badge = OCR_STATUS_BADGE[invoice.ocrStatus] || OCR_STATUS_BADGE.NONE;

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 50) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{invoice.fileName}</p>
            <p className="text-xs text-gray-400">{formatDate(invoice.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
            {badge.label}
          </span>
          <a
            href={invoice.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-amber-600"
            title="Ver archivo"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {/* OCR Data (view/edit) */}
      {invoice.ocrStatus === 'COMPLETED' && (
        <div className="border border-gray-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">Datos OCR</span>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <Edit3 size={12} /> Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveOcr}
                  disabled={saving}
                  className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Importe</label>
                <input
                  type="number"
                  step="0.01"
                  value={editData.ocrAmount ?? ''}
                  onChange={e => setEditData(d => ({ ...d, ocrAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha</label>
                <input
                  type="date"
                  value={editData.ocrDate}
                  onChange={e => setEditData(d => ({ ...d, ocrDate: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Proveedor</label>
                <input
                  type="text"
                  value={editData.ocrVendor}
                  onChange={e => setEditData(d => ({ ...d, ocrVendor: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">N. Factura</label>
                <input
                  type="text"
                  value={editData.ocrInvoiceNumber}
                  onChange={e => setEditData(d => ({ ...d, ocrInvoiceNumber: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Importe:</span>{' '}
                <span className="text-gray-800 font-medium">
                  {invoice.ocrAmount != null ? `${formatCurrency(invoice.ocrAmount)}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Fecha:</span>{' '}
                <span className="text-gray-800">{invoice.ocrDate ? formatDate(invoice.ocrDate) : '—'}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Proveedor:</span>{' '}
                <span className="text-gray-800">{invoice.ocrVendor || '—'}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs">N. Factura:</span>{' '}
                <span className="text-gray-800">{invoice.ocrInvoiceNumber || '—'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OCR Error */}
      {invoice.ocrStatus === 'FAILED' && invoice.ocrError && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">{invoice.ocrError}</p>
      )}

      {/* Suggestions */}
      {invoice.ocrStatus === 'COMPLETED' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">Coincidencias</span>
            <button
              onClick={loadSuggestions}
              disabled={loadingSuggestions}
              className="text-xs text-gray-400 hover:text-amber-600 flex items-center gap-1"
            >
              <RefreshCw size={12} className={loadingSuggestions ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingSuggestions ? (
            <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Buscando coincidencias...
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map(s => (
              <div
                key={s.transactionId}
                className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{s.concept}</p>
                  <p className="text-xs text-gray-400">
                    {formatCurrency(Math.abs(s.amount))} · {formatDate(s.date)}
                    {s.projectName && ` · ${s.projectName}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor(s.score)}`}>
                    {s.score}
                  </span>
                  <button
                    onClick={() => handleLink(s.transactionId)}
                    disabled={linking !== null}
                    className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
                    title="Confirmar"
                  >
                    {linking === s.transactionId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 py-1">Sin coincidencias encontradas</p>
          )}
        </div>
      )}

      {/* Manual search */}
      <div className="space-y-2">
        {!showSearch ? (
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            <Search size={12} /> Buscar transaccion manualmente
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar por concepto, importe..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200 disabled:opacity-50"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
              <button
                onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}
                className="px-2 py-1.5 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {searchResults.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{t.concept}</p>
                      <p className="text-xs text-gray-400">
                        {formatCurrency(Math.abs(t.amount))} · {formatDate(t.date)}
                        {t.project?.name && ` · ${t.project.name}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLink(t.id)}
                      disabled={linking !== null}
                      className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50 flex-shrink-0"
                      title="Vincular"
                    >
                      {linking === t.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="pt-1 border-t border-gray-50">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Eliminar factura
        </button>
      </div>
    </div>
  );
}

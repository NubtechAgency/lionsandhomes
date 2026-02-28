import { useState, useEffect } from 'react';
import { Check, X, Edit3, Save, Search, FileText, ExternalLink, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { invoiceAPI } from '../services/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import TransactionSearchModal from './TransactionSearchModal';
import type { OrphanInvoice, MatchSuggestion, OcrStatus } from '../types';

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
  });
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);

  const getCategoryLabel = (key: string | null) => {
    if (!key) return null;
    return EXPENSE_CATEGORIES.find(c => c.key === key)?.label || key;
  };

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
      setShowSearchModal(false);
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
            <div className="grid grid-cols-3 gap-2">
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
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
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
            suggestions.map(s => {
              const tx = s.transaction;
              const isExpanded = expandedSuggestion === s.transactionId;
              return (
                <div key={s.transactionId} className="bg-gray-50 rounded-lg overflow-hidden">
                  {/* Summary row (clickable) */}
                  <div
                    className="flex items-center justify-between gap-2 p-2 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setExpandedSuggestion(isExpanded ? null : s.transactionId)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{tx.concept}</p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(Math.abs(tx.amount))} · {formatDate(tx.date)}
                          {tx.project && ` · ${tx.project.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor(s.score)}`}>
                        {s.score}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleLink(s.transactionId); }}
                        disabled={linking !== null}
                        className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
                        title="Vincular"
                      >
                        {linking === s.transactionId ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-gray-400">Concepto:</span>{' '}
                          <span className="text-gray-700">{tx.concept}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Importe:</span>{' '}
                          <span className="text-gray-700 font-medium">{formatCurrency(Math.abs(tx.amount))}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Fecha:</span>{' '}
                          <span className="text-gray-700">{formatDate(tx.date)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Proyecto:</span>{' '}
                          <span className="text-gray-700">{tx.project?.name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Categoria:</span>{' '}
                          <span className="text-gray-700">{getCategoryLabel(tx.expenseCategory) || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Factura:</span>{' '}
                          <span className={tx.hasInvoice ? 'text-green-600' : 'text-amber-600'}>
                            {tx.hasInvoice ? 'Si' : 'No'}
                          </span>
                        </div>
                        {tx.notes && (
                          <div className="col-span-2">
                            <span className="text-gray-400">Notas:</span>{' '}
                            <span className="text-gray-700">{tx.notes}</span>
                          </div>
                        )}
                      </div>
                      {/* Score breakdown */}
                      <div className="flex items-center gap-3 text-xs text-gray-400 pt-1 border-t border-gray-100">
                        <span>Puntuacion:</span>
                        <span>Importe <b className="text-gray-600">{s.scoreBreakdown.amountScore}</b>/40</span>
                        <span>Fecha <b className="text-gray-600">{s.scoreBreakdown.dateScore}</b>/30</span>
                        <span>Concepto <b className="text-gray-600">{s.scoreBreakdown.conceptScore}</b>/30</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-gray-400 py-1">Sin coincidencias encontradas</p>
          )}
        </div>
      )}

      {/* Manual search button → opens modal */}
      <button
        onClick={() => setShowSearchModal(true)}
        className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
      >
        <Search size={12} /> Buscar transaccion manualmente
      </button>

      {showSearchModal && (
        <TransactionSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onLink={handleLink}
          linking={linking}
          initialSearch={invoice.ocrVendor || undefined}
          initialAmount={invoice.ocrAmount || undefined}
          initialDate={invoice.ocrDate?.split('T')[0] || undefined}
        />
      )}

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

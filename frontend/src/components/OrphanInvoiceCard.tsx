import { useState, useEffect } from 'react';
import { Check, X, Edit3, Save, Search, FileText, Eye, Loader2, RefreshCw } from 'lucide-react';
import { invoiceAPI } from '../services/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import TransactionSearchModal from './TransactionSearchModal';
import InvoicePreviewModal from './InvoicePreviewModal';
import MatchDetailModal from './MatchDetailModal';
import type { OrphanInvoice, MatchSuggestion, OcrStatus } from '../types';

interface OrphanInvoiceCardProps {
  invoice: OrphanInvoice;
  onLinked: () => void;
  onDeleted: () => void;
}

// Simplified status badge — only show user-facing states
const OCR_STATUS_BADGE: Record<OcrStatus, { label: string; color: string } | null> = {
  NONE: null,
  PENDING: { label: 'Procesando', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Procesando', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Listo', color: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Error OCR', color: 'bg-red-100 text-red-700' },
  BUDGET_EXCEEDED: { label: 'Sin OCR', color: 'bg-gray-100 text-gray-600' },
};

// Score color helper
function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 50) return 'text-amber-600 bg-amber-50';
  return 'text-red-500 bg-red-50';
}

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
  const [showPreview, setShowPreview] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchSuggestion | null>(null);

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
      const data: Record<string, unknown> = {};
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
      setSelectedMatch(null);
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

  const badge = OCR_STATUS_BADGE[invoice.ocrStatus];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      {/* Header: file info + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{invoice.fileName}</p>
            <p className="text-xs text-gray-400">{formatDate(invoice.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
              {badge.label}
            </span>
          )}
          {invoice.source && invoice.source !== 'web' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              invoice.source === 'telegram' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {invoice.source === 'telegram' ? 'Telegram' : 'Bulk'}
            </span>
          )}
          <button
            onClick={() => setShowPreview(true)}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Ver factura"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>

      {/* OCR Data (view/edit) — compact inline */}
      {invoice.ocrStatus === 'COMPLETED' && (
        <div className="border border-gray-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">Datos OCR</span>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
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
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha</label>
                <input
                  type="date"
                  value={editData.ocrDate}
                  onChange={e => setEditData(d => ({ ...d, ocrDate: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Proveedor</label>
                <input
                  type="text"
                  value={editData.ocrVendor}
                  onChange={e => setEditData(d => ({ ...d, ocrVendor: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-gray-400"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-800 font-medium">
                {invoice.ocrAmount != null ? `${formatCurrency(invoice.ocrAmount)} \u20ac` : '\u2014'}
              </span>
              <span className="text-gray-500">
                {invoice.ocrDate ? formatDate(invoice.ocrDate) : '\u2014'}
              </span>
              <span className="text-gray-500 truncate">
                {invoice.ocrVendor || '\u2014'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* OCR Error */}
      {invoice.ocrStatus === 'FAILED' && invoice.ocrError && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">{invoice.ocrError}</p>
      )}

      {/* Suggestions — SIMPLIFIED: compact list, click for detail */}
      {invoice.ocrStatus === 'COMPLETED' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">
              Coincidencias
              {suggestions.length > 0 && (
                <span className="ml-1.5 text-gray-400 font-normal normal-case">({suggestions.length})</span>
              )}
            </span>
            <button
              onClick={loadSuggestions}
              disabled={loadingSuggestions}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <RefreshCw size={12} className={loadingSuggestions ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingSuggestions ? (
            <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Buscando...
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-1">
              {suggestions.map(s => {
                const tx = s.transaction;
                return (
                  <div
                    key={s.transactionId}
                    className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => setSelectedMatch(s)}
                  >
                    {/* Score badge */}
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor(s.score)}`}>
                      {s.score}
                    </span>

                    {/* Amount */}
                    <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                      {formatCurrency(Math.abs(tx.amount))} \u20ac
                    </span>

                    {/* Concept — fills remaining space */}
                    <span className="text-xs text-gray-500 truncate flex-1">
                      {tx.concept}
                    </span>

                    {/* Quick link button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLink(s.transactionId); }}
                      disabled={linking !== null}
                      className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 flex-shrink-0"
                      title="Vincular"
                    >
                      {linking === s.transactionId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-1">Sin coincidencias</p>
          )}
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <button
          onClick={() => setShowSearchModal(true)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <Search size={12} /> Buscar manualmente
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Eliminar
        </button>
      </div>

      {/* Modals */}
      {showPreview && (
        <InvoicePreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          url={invoice.downloadUrl}
          fileName={invoice.fileName}
        />
      )}

      {selectedMatch && (
        <MatchDetailModal
          isOpen={!!selectedMatch}
          onClose={() => setSelectedMatch(null)}
          suggestion={selectedMatch}
          invoice={invoice}
          onLink={handleLink}
          linking={linking}
        />
      )}

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
    </div>
  );
}

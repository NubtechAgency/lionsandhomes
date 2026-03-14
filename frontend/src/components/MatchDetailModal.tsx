import { X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/formatters';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import type { MatchSuggestion, OrphanInvoice } from '../types';

interface MatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestion: MatchSuggestion;
  invoice: OrphanInvoice;
  onLink: (transactionId: number) => void;
  linking: number | null;
}

// --- Score ring SVG (48x48) ---
function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <svg width={48} height={48} className="flex-shrink-0">
      <circle cx={24} cy={24} r={r} fill="none" stroke="#e5e7eb" strokeWidth={3} />
      <circle
        cx={24} cy={24} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 24 24)"
      />
      <text x={24} y={24} textAnchor="middle" dominantBaseline="central"
        className="text-sm font-bold" fill={color}>{score}</text>
    </svg>
  );
}

// --- Match indicators ---
type MatchInd = { icon: 'check' | 'tilde' | 'x'; color: string; label: string };

function getAmountMatch(ocrAmount: number | null, txAmount: number): MatchInd | null {
  if (ocrAmount == null) return null;
  const diff = Math.abs(ocrAmount - Math.abs(txAmount));
  const pct = ocrAmount > 0 ? (diff / ocrAmount) * 100 : 100;
  if (pct < 1) return { icon: 'check', color: 'text-green-600', label: 'Exacto' };
  if (pct < 10) return { icon: 'tilde', color: 'text-amber-600', label: `~${pct.toFixed(0)}% dif.` };
  return { icon: 'x', color: 'text-red-500', label: `${pct.toFixed(0)}% dif.` };
}

function getDateMatch(ocrDate: string | null, txDate: string): MatchInd | null {
  if (!ocrDate) return null;
  const diff = Math.abs(new Date(ocrDate).getTime() - new Date(txDate).getTime());
  const days = diff / (1000 * 60 * 60 * 24);
  if (days <= 0.5) return { icon: 'check', color: 'text-green-600', label: 'Misma fecha' };
  if (days <= 3) return { icon: 'tilde', color: 'text-amber-600', label: `${Math.round(days)}d dif.` };
  return { icon: 'x', color: 'text-red-500', label: `${Math.round(days)}d dif.` };
}

function MatchIcon({ ind }: { ind: MatchInd }) {
  if (ind.icon === 'check') return <Check size={14} className={ind.color} />;
  if (ind.icon === 'tilde') return <span className={`text-xs font-bold ${ind.color}`}>~</span>;
  return <X size={14} className={ind.color} />;
}

export default function MatchDetailModal({ isOpen, onClose, suggestion, invoice, onLink, linking }: MatchDetailModalProps) {
  if (!isOpen) return null;

  const tx = suggestion.transaction;
  const amtMatch = getAmountMatch(invoice.ocrAmount, tx.amount);
  const dateMatch = getDateMatch(invoice.ocrDate, tx.date);
  const catLabel = tx.expenseCategory
    ? EXPENSE_CATEGORIES.find(c => c.key === tx.expenseCategory)?.label || tx.expenseCategory
    : null;

  const breakdowns = [
    { label: 'Importe', val: suggestion.scoreBreakdown.amountScore, max: 40 },
    { label: 'Fecha', val: suggestion.scoreBreakdown.dateScore, max: 30 },
    { label: 'Concepto', val: suggestion.scoreBreakdown.conceptScore, max: 30 },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ScoreRing score={suggestion.score} />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Detalle de coincidencia</h3>
              <p className="text-xs text-gray-500">Puntuacion: {suggestion.score}/100</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Comparison grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Invoice side */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Factura (OCR)</p>
              <div>
                <p className="text-xs text-gray-400">Importe</p>
                <p className="text-lg font-semibold text-gray-900">
                  {invoice.ocrAmount != null ? `${formatCurrency(invoice.ocrAmount)} \u20ac` : '\u2014'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha</p>
                <p className="text-sm text-gray-800">
                  {invoice.ocrDate ? formatDate(invoice.ocrDate) : '\u2014'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Proveedor</p>
                <p className="text-sm text-gray-800">{invoice.ocrVendor || '\u2014'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Archivo</p>
                <p className="text-sm text-gray-600 truncate">{invoice.fileName}</p>
              </div>
            </div>

            {/* Transaction side */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transaccion</p>
              <div>
                <p className="text-xs text-gray-400">Importe</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(Math.abs(tx.amount))} \u20ac
                  </p>
                  {amtMatch && (
                    <span className={`flex items-center gap-0.5 text-xs ${amtMatch.color}`}>
                      <MatchIcon ind={amtMatch} /> {amtMatch.label}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-800">{formatDate(tx.date)}</p>
                  {dateMatch && (
                    <span className={`flex items-center gap-0.5 text-xs ${dateMatch.color}`}>
                      <MatchIcon ind={dateMatch} /> {dateMatch.label}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400">Concepto</p>
                <p className="text-sm text-gray-800">{tx.concept}</p>
              </div>
              {tx.project && (
                <div>
                  <p className="text-xs text-gray-400">Proyecto</p>
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                    {tx.project.name}
                  </span>
                </div>
              )}
              {catLabel && (
                <div>
                  <p className="text-xs text-gray-400">Categoria</p>
                  <p className="text-sm text-gray-700">{catLabel}</p>
                </div>
              )}
              {tx.notes && (
                <div>
                  <p className="text-xs text-gray-400">Notas</p>
                  <p className="text-sm text-gray-600">{tx.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Warning if transaction already has invoice */}
          {tx.hasInvoice && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">Esta transaccion ya tiene una factura vinculada</p>
            </div>
          )}

          {/* Score breakdown */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Desglose de puntuacion</p>
            {breakdowns.map(b => (
              <div key={b.label} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-16">{b.label}</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      b.val / b.max >= 0.8 ? 'bg-green-400' : b.val / b.max >= 0.5 ? 'bg-amber-400' : 'bg-red-300'
                    }`}
                    style={{ width: `${(b.val / b.max) * 100}%` }}
                  />
                </div>
                <span className="text-gray-500 w-10 text-right">{b.val}/{b.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: Link button */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => onLink(suggestion.transactionId)}
            disabled={linking !== null}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {linking === suggestion.transactionId ? (
              <><Loader2 size={16} className="animate-spin" /> Vinculando...</>
            ) : (
              <><Check size={16} /> Vincular factura a esta transaccion</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

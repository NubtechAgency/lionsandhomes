import { useState, useMemo } from 'react';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, AlertTriangle, Check } from 'lucide-react';
import clsx from 'clsx';
import { addWeeks, addMonths, format } from 'date-fns';
import { formatCurrency } from '../lib/formatters';
import type {
  CashFlowType, CreateCashFlowData, Project,
  PlanTranche, TrancheFrequency,
} from '../types';

interface Props {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (entries: CreateCashFlowData[]) => Promise<void>;
}

const FREQUENCY_LABELS: Record<TrancheFrequency, string> = {
  once: 'Una vez',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

function generateDates(startDate: string, frequency: TrancheFrequency, repetitions: number): string[] {
  const dates: string[] = [];
  const base = new Date(startDate + 'T12:00:00');

  for (let i = 0; i < repetitions; i++) {
    let d: Date;
    switch (frequency) {
      case 'once': d = base; break;
      case 'weekly': d = addWeeks(base, i); break;
      case 'biweekly': d = addWeeks(base, i * 2); break;
      case 'monthly': d = addMonths(base, i); break;
    }
    dates.push(format(d, 'yyyy-MM-dd'));
  }
  return dates;
}

function generateEntries(
  type: CashFlowType,
  description: string,
  projectId: number | null,
  notes: string | null,
  tranches: PlanTranche[],
): CreateCashFlowData[] {
  const entries: CreateCashFlowData[] = [];
  const totalCount = tranches.reduce((sum, t) => sum + t.repetitions, 0);
  let idx = 0;

  for (const tranche of tranches) {
    const dates = generateDates(tranche.startDate, tranche.frequency, tranche.repetitions);
    for (const date of dates) {
      idx++;
      entries.push({
        type,
        description: totalCount > 1 ? `${description} (${idx}/${totalCount})` : description,
        amount: tranche.amount,
        date,
        projectId,
        notes,
      });
    }
  }
  return entries;
}

function newTranche(): PlanTranche {
  return {
    id: crypto.randomUUID(),
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    frequency: 'once',
    repetitions: 1,
  };
}

export default function CashFlowPlanModal({ projects, isOpen, onClose, onSave }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [type, setType] = useState<CashFlowType>('EXPENSE');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Step 2
  const [tranches, setTranches] = useState<PlanTranche[]>([newTranche()]);

  // UI
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Computed
  const generatedTotal = useMemo(
    () => tranches.reduce((sum, t) => sum + t.amount * t.repetitions, 0),
    [tranches]
  );
  const declaredTotal = parseFloat(totalAmount) || 0;
  const totalMatches = Math.abs(generatedTotal - declaredTotal) < 0.01;

  const generatedEntries = useMemo(
    () => generateEntries(type, description, projectId || null, notes.trim() || null, tranches),
    [type, description, projectId, notes, tranches]
  );

  if (!isOpen) return null;

  const reset = () => {
    setStep(1);
    setType('EXPENSE');
    setDescription('');
    setTotalAmount('');
    setProjectId('');
    setNotes('');
    setTranches([newTranche()]);
    setError(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Step validations
  const validateStep1 = (): boolean => {
    if (!description.trim()) { setError('La descripción es requerida'); return false; }
    if (!totalAmount || declaredTotal <= 0) { setError('El importe total debe ser positivo'); return false; }
    setError(null);
    return true;
  };

  const validateStep2 = (): boolean => {
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      if (t.amount <= 0) { setError(`Tramo ${i + 1}: el importe debe ser positivo`); return false; }
      if (!t.startDate) { setError(`Tramo ${i + 1}: la fecha es requerida`); return false; }
      if (t.repetitions < 1) { setError(`Tramo ${i + 1}: mínimo 1 repetición`); return false; }
    }
    setError(null);
    return true;
  };

  const goToStep2 = () => { if (validateStep1()) setStep(2); };
  const goToStep3 = () => { if (validateStep2()) setStep(3); };

  const handleCreate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onSave(generatedEntries);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Error al crear las entradas');
    } finally {
      setIsLoading(false);
    }
  };

  const updateTranche = (id: string, updates: Partial<PlanTranche>) => {
    setTranches(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, ...updates };
      if (updated.frequency === 'once') updated.repetitions = 1;
      return updated;
    }));
  };

  const removeTranche = (id: string) => {
    if (tranches.length <= 1) return;
    setTranches(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-amber-600 text-white rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold">Plan de {type === 'INCOME' ? 'cobros' : 'pagos'}</h2>
            <p className="text-amber-100 text-xs">Paso {step} de 3</p>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-amber-700 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-amber-100">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* ── STEP 1: Info General ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setType('INCOME')}
                    className={clsx('flex-1 py-2 rounded-lg text-sm font-medium transition-colors border',
                      type === 'INCOME' ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                    Cobro
                  </button>
                  <button type="button" onClick={() => setType('EXPENSE')}
                    className={clsx('flex-1 py-2 rounded-lg text-sm font-medium transition-colors border',
                      type === 'EXPENSE' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                    Pago
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Ej: Contrato construcción Piso Gran Vía"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Importe total</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">&euro;</span>
                  <input type="number" step="0.01" min="0.01" value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    placeholder="150000"
                    className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto (opcional)</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Sin proyecto</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={goToStep2}
                  className="flex items-center gap-1 px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
                  Siguiente <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Distribución ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">
                  Total declarado: <span className="font-semibold">&euro;{formatCurrency(declaredTotal)}</span>
                </span>
                <div className={clsx('flex items-center gap-1 text-sm font-medium',
                  totalMatches ? 'text-green-600' : 'text-amber-600')}>
                  {totalMatches ? <Check size={14} /> : <AlertTriangle size={14} />}
                  Total generado: &euro;{formatCurrency(generatedTotal)}
                </div>
              </div>

              {/* Tranches */}
              <div className="space-y-3">
                {tranches.map((tranche, idx) => (
                  <div key={tranche.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Tramo {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          Subtotal: &euro;{formatCurrency(tranche.amount * tranche.repetitions)}
                        </span>
                        {tranches.length > 1 && (
                          <button onClick={() => removeTranche(tranche.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Importe</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-gray-400 text-xs">&euro;</span>
                          <input type="number" step="0.01" min="0.01"
                            value={tranche.amount || ''}
                            onChange={e => updateTranche(tranche.id, { amount: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fecha inicio</label>
                        <input type="date" value={tranche.startDate}
                          onChange={e => updateTranche(tranche.id, { startDate: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Frecuencia</label>
                        <select value={tranche.frequency}
                          onChange={e => updateTranche(tranche.id, { frequency: e.target.value as TrancheFrequency })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                          {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Repeticiones</label>
                        <input type="number" min="1" max="200"
                          value={tranche.repetitions}
                          disabled={tranche.frequency === 'once'}
                          onChange={e => updateTranche(tranche.id, { repetitions: parseInt(e.target.value) || 1 })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setTranches(prev => [...prev, newTranche()])}
                className="flex items-center gap-1 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                <Plus size={14} /> Agregar tramo
              </button>

              {!totalMatches && generatedTotal > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    El total generado (&euro;{formatCurrency(generatedTotal)}) no coincide con el importe declarado (&euro;{formatCurrency(declaredTotal)}).
                    Puedes continuar de todos modos.
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => { setError(null); setStep(1); }}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={16} /> Atrás
                </button>
                <button onClick={goToStep3}
                  className="flex items-center gap-1 px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
                  Vista previa <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Vista Previa ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  Se crearán <span className="font-semibold">{generatedEntries.length} entradas</span> por un total de{' '}
                  <span className="font-semibold">&euro;{formatCurrency(generatedTotal)}</span>
                </p>
              </div>

              <div className="max-h-[40vh] overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="sticky top-0 bg-amber-50/90">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">#</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Fecha</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Descripción</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {generatedEntries.map((entry, i) => (
                      <tr key={i} className="hover:bg-amber-50/30">
                        <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{entry.date}</td>
                        <td className="px-3 py-2 text-sm text-gray-900 max-w-[200px] truncate">{entry.description}</td>
                        <td className={clsx('px-3 py-2 text-sm font-medium text-right',
                          type === 'INCOME' ? 'text-green-700' : 'text-red-700')}>
                          {type === 'INCOME' ? '+' : '-'}&euro;{formatCurrency(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => { setError(null); setStep(2); }}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={16} /> Atrás
                </button>
                <button onClick={handleCreate} disabled={isLoading}
                  className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {isLoading ? 'Creando...' : `Crear ${generatedEntries.length} entradas`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

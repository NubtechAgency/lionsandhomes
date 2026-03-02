import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { CashFlowEntry, CashFlowType, UpdateCashFlowData, Project } from '../types';

interface Props {
  entry?: CashFlowEntry | null;
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: UpdateCashFlowData) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function CashFlowEntryModal({ entry, projects, isOpen, onClose, onSave, onDelete }: Props) {
  const [type, setType] = useState<CashFlowType>('EXPENSE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (entry) {
      setType(entry.type);
      setDescription(entry.description);
      setAmount(entry.amount.toString());
      setDate(entry.date.split('T')[0]);
      setProjectId(entry.projectId || '');
      setNotes(entry.notes || '');
    }
    setError(null);
    setShowDeleteConfirm(false);
  }, [entry, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) { setError('La descripción es requerida'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('El importe debe ser positivo'); return; }
    if (!date) { setError('La fecha es requerida'); return; }

    setIsLoading(true);
    try {
      await onSave({
        type,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        projectId: projectId || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !onDelete) return;
    setIsLoading(true);
    try {
      await onDelete(entry.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 bg-amber-600 text-white rounded-t-xl">
          <h2 className="text-lg font-semibold">Editar entrada</h2>
          <button onClick={onClose} className="p-1 hover:bg-amber-700 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('INCOME')}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors border',
                  type === 'INCOME'
                    ? 'bg-green-100 border-green-300 text-green-800'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                Cobro
              </button>
              <button
                type="button"
                onClick={() => setType('EXPENSE')}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors border',
                  type === 'EXPENSE'
                    ? 'bg-red-100 border-red-300 text-red-800'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                Pago
              </button>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              required
            />
          </div>

          {/* Importe y Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Importe</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">&euro;</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Proyecto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto (opcional)</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="">Sin proyecto</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {onDelete && entry && (
                showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Eliminar?</span>
                    <button type="button" onClick={handleDelete} disabled={isLoading}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                      Sí
                    </button>
                    <button type="button" onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                      No
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} /> Eliminar
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={isLoading}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {isLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

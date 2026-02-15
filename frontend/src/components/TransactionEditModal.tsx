// Modal de edición de transacciones - Multi-invoice
import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { invoiceAPI } from '../services/api';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import type { Transaction, UpdateTransactionData, ExpenseCategory, Project } from '../types';

interface InvoiceWithUrl {
  id: number;
  fileName: string;
  downloadUrl: string;
  createdAt: string;
}

interface Props {
  transaction: Transaction;
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: UpdateTransactionData) => Promise<void>;
}

export default function TransactionEditModal({ transaction, projects, isOpen, onClose, onSave }: Props) {
  const [formData, setFormData] = useState<UpdateTransactionData>({
    projectId: transaction.projectId,
    expenseCategory: transaction.expenseCategory,
    notes: transaction.notes || '',
    isFixed: transaction.isFixed,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Estado para campos editables de transacciones manuales
  const [editAmountType, setEditAmountType] = useState<'expense' | 'income'>(
    transaction.amount < 0 ? 'expense' : 'income'
  );
  const [editDate, setEditDate] = useState(transaction.date.split('T')[0]);
  const [editAmount, setEditAmount] = useState(Math.abs(transaction.amount).toString());
  const [editConcept, setEditConcept] = useState(transaction.concept);

  // Estados para facturas
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasInvoice, setHasInvoice] = useState(transaction.hasInvoice);
  const [invoiceCount, setInvoiceCount] = useState(transaction.invoices?.length || 0);

  // Estados para preview de facturas (múltiples)
  const [invoicesWithUrls, setInvoicesWithUrls] = useState<InvoiceWithUrl[]>([]);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<number | null>(null);

  // Actualizar formData cuando cambia la transacción
  useEffect(() => {
    setFormData({
      projectId: transaction.projectId,
      expenseCategory: transaction.expenseCategory,
      notes: transaction.notes || '',
      isFixed: transaction.isFixed,
    });
    setEditAmountType(transaction.amount < 0 ? 'expense' : 'income');
    setEditDate(transaction.date.split('T')[0]);
    setEditAmount(Math.abs(transaction.amount).toString());
    setEditConcept(transaction.concept);
    setHasInvoice(transaction.hasInvoice);
    setInvoiceCount(transaction.invoices?.length || 0);
    setSelectedFile(null);
    setUploadError(null);
    setInvoicesWithUrls([]);
  }, [transaction]);

  // Cargar previews cuando el modal se abre y hay facturas
  useEffect(() => {
    if (isOpen && hasInvoice && invoicesWithUrls.length === 0) {
      loadInvoicePreviews();
    }
    if (!isOpen) {
      setInvoicesWithUrls([]);
    }
  }, [isOpen, hasInvoice]);

  const loadInvoicePreviews = async () => {
    try {
      setIsLoadingPreviews(true);
      const { invoices } = await invoiceAPI.getInvoiceUrls(transaction.id);
      setInvoicesWithUrls(invoices);
    } catch (err) {
      console.error('Error al cargar previews:', err);
    } finally {
      setIsLoadingPreviews(false);
    }
  };

  const isImageFile = (fileName: string): boolean => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  };

  const isPdfFile = (fileName: string): boolean => {
    return /\.pdf$/i.test(fileName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const data: UpdateTransactionData = { ...formData };
      // Incluir campos editables solo para manuales
      if (transaction.isManual) {
        const rawAmount = parseFloat(editAmount);
        if (!isNaN(rawAmount) && rawAmount > 0) {
          data.amount = editAmountType === 'expense' ? -rawAmount : rawAmount;
        }
        if (editDate) data.date = editDate;
        if (editConcept.trim()) data.concept = editConcept.trim();
      }
      await onSave(transaction.id, data);
      onClose();
    } catch (error) {
      console.error('Error al guardar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Subir factura (se añade, no reemplaza)
  const handleUploadInvoice = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      setUploadProgress(50);
      const { transaction: updated } = await invoiceAPI.uploadInvoice(transaction.id, selectedFile);
      setUploadProgress(100);

      setHasInvoice(updated.hasInvoice);
      setInvoiceCount(updated.invoices?.length || 0);
      setSelectedFile(null);
      // Recargar previews
      setInvoicesWithUrls([]);
      loadInvoicePreviews();
    } catch (err: any) {
      setUploadError(err.message || 'Error al subir la factura');
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Eliminar una factura individual
  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta factura?')) return;

    try {
      setDeletingInvoiceId(invoiceId);
      setUploadError(null);
      const { transaction: updated } = await invoiceAPI.deleteInvoice(invoiceId);
      setHasInvoice(updated.hasInvoice);
      setInvoiceCount(updated.invoices?.length || 0);
      setInvoicesWithUrls(prev => prev.filter(inv => inv.id !== invoiceId));
    } catch (err: any) {
      setUploadError(err.message || 'Error al eliminar la factura');
      console.error(err);
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-amber-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
          <h2 className="text-xl font-semibold">Editar Transacción</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* Información de la transacción */}
            {transaction.isManual ? (
              <div className="bg-purple-50 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-700">Información de la Transacción</h3>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Manual
                  </span>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditAmountType('expense')}
                      className={clsx(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                        editAmountType === 'expense'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      Gasto
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditAmountType('income')}
                      className={clsx(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                        editAmountType === 'income'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      Ingreso
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Importe (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Concepto / Proveedor</label>
                  <input
                    type="text"
                    value={editConcept}
                    onChange={e => setEditConcept(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <h3 className="font-semibold text-gray-700 mb-3">Información de la Transacción</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Fecha:</span>
                    <p className="font-medium">
                      {new Date(transaction.date).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Monto:</span>
                    <p className={`font-bold ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {transaction.amount < 0 ? '-' : '+'}€
                      {Math.abs(transaction.amount).toLocaleString('es-ES', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Concepto:</span>
                  <p className="font-medium">{transaction.concept}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Categoría del Banco:</span>
                  <p className="font-medium">{transaction.category}</p>
                </div>
              </div>
            )}

            {/* Campos editables */}
            <div className="space-y-4">
              {/* Proyecto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Asignar a Proyecto
                </label>
                <select
                  value={formData.projectId || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    projectId: e.target.value ? parseInt(e.target.value) : null
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoría Lions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría de Gasto Lions
                </label>
                <select
                  value={formData.expenseCategory || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    expenseCategory: (e.target.value as ExpenseCategory) || null
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Sin categoría</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Gasto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Gasto
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isFixed: false })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      !formData.isFixed
                        ? 'bg-orange-100 text-orange-700 border-2 border-orange-400'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    Variable
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isFixed: true })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      formData.isFixed
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    Fijo
                  </button>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    notes: e.target.value
                  })}
                  rows={4}
                  placeholder="Añade notas adicionales sobre esta transacción..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* SECCIÓN DE FACTURAS (múltiples) */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Facturas {invoiceCount > 0 && <span className="text-sm font-normal text-gray-500">({invoiceCount})</span>}
              </h3>

              {/* Lista de facturas existentes */}
              {isLoadingPreviews ? (
                <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg p-8 mb-4">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Cargando facturas...</p>
                  </div>
                </div>
              ) : invoicesWithUrls.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {invoicesWithUrls.map((inv) => (
                    <div key={inv.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Preview */}
                      {isImageFile(inv.fileName) ? (
                        <img
                          src={inv.downloadUrl}
                          alt={inv.fileName}
                          className="w-full max-h-64 object-contain bg-gray-50"
                        />
                      ) : isPdfFile(inv.fileName) ? (
                        <iframe
                          src={inv.downloadUrl}
                          title={inv.fileName}
                          className="w-full h-64"
                        />
                      ) : null}

                      {/* Info + acciones */}
                      <div className="flex items-center justify-between bg-green-50 border-t border-green-200 p-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-sm font-medium text-green-900 truncate">{inv.fileName}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => window.open(inv.downloadUrl, '_blank')}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors"
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(inv.id)}
                            disabled={deletingInvoiceId === inv.id}
                            className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                          >
                            {deletingInvoiceId === inv.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Añadir factura (siempre visible) */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  {hasInvoice ? 'Añadir otra factura' : 'Subir factura'} (PDF, JPG, PNG)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />

                {selectedFile && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-3 rounded-lg">
                    <p className="text-sm text-amber-900 font-medium truncate">
                      {selectedFile.name}
                    </p>
                    <button
                      type="button"
                      onClick={handleUploadInvoice}
                      disabled={isUploading}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {isUploading ? 'Subiendo...' : 'Subir'}
                    </button>
                  </div>
                )}

                {isUploading && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 text-center">
                      {uploadProgress}% completado
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                  {uploadError}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal de edición de transacciones
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { invoiceAPI } from '../services/api';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import type { Transaction, UpdateTransactionData, ExpenseCategory, Project } from '../types';

interface Props {
  transaction: Transaction;
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: UpdateTransactionData) => Promise<void>;  // Callback para guardar
}

export default function TransactionEditModal({ transaction, projects, isOpen, onClose, onSave }: Props) {
  const [formData, setFormData] = useState<UpdateTransactionData>({
    projectId: transaction.projectId,
    expenseCategory: transaction.expenseCategory,
    notes: transaction.notes || '',
    isFixed: transaction.isFixed,
  });
  const [isSaving, setIsSaving] = useState(false);

  // 📄 Estados para upload de factura
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasInvoice, setHasInvoice] = useState(transaction.hasInvoice);
  const [invoiceFileName, setInvoiceFileName] = useState(transaction.invoiceFileName);
  const [isReplacing, setIsReplacing] = useState(false);

  // Actualizar formData cuando cambia la transacción
  useEffect(() => {
    setFormData({
      projectId: transaction.projectId,
      expenseCategory: transaction.expenseCategory,
      notes: transaction.notes || '',
      isFixed: transaction.isFixed,
    });
    setHasInvoice(transaction.hasInvoice);
    setInvoiceFileName(transaction.invoiceFileName);
    setSelectedFile(null);
    setUploadError(null);
    setIsReplacing(false);
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSaving(true);
      await onSave(transaction.id, formData);
      onClose();
    } catch (error) {
      console.error('Error al guardar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 📤 FUNCIÓN - Subir factura a Cloudflare R2
  const handleUploadInvoice = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      // Paso 1: Obtener URL firmada del backend
      const { uploadUrl, key } = await invoiceAPI.getUploadUrl(
        transaction.id,
        selectedFile.name
      );
      setUploadProgress(33);

      // Paso 2: Subir archivo directo a R2
      await invoiceAPI.uploadFile(uploadUrl, selectedFile);
      setUploadProgress(66);

      // Paso 3: Asociar factura a la transacción
      await invoiceAPI.attachInvoice(transaction.id, key, selectedFile.name);
      setUploadProgress(100);

      // Actualizar estados locales
      setHasInvoice(true);
      setInvoiceFileName(selectedFile.name);
      setSelectedFile(null);
      setIsReplacing(false);
    } catch (err: any) {
      setUploadError(err.message || 'Error al subir la factura');
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 👁️ FUNCIÓN - Ver factura (abrir en nueva pestaña)
  const handleViewInvoice = async () => {
    try {
      const { downloadUrl } = await invoiceAPI.getDownloadUrl(transaction.id);
      window.open(downloadUrl, '_blank');
    } catch (err: any) {
      setUploadError(err.message || 'Error al obtener la factura');
      console.error(err);
    }
  };

  // 🗑️ FUNCIÓN - Eliminar factura
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteInvoice = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta factura?')) return;

    try {
      setIsDeleting(true);
      setUploadError(null);
      await invoiceAPI.deleteInvoice(transaction.id);
      setHasInvoice(false);
      setInvoiceFileName(null);
      setSelectedFile(null);
    } catch (err: any) {
      setUploadError(err.message || 'Error al eliminar la factura');
      console.error(err);
    } finally {
      setIsDeleting(false);
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
          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Información read-only */}
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

              {transaction.isManual && (
                <div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    Transacción Manual
                  </span>
                </div>
              )}
            </div>

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

            {/* SECCIÓN DE FACTURA */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📄 Factura</h3>

              {hasInvoice && !isReplacing ? (
                // YA TIENE FACTURA
                <div className="flex items-center justify-between bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <svg
                      className="w-8 h-8 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <div>
                      <p className="font-semibold text-green-900">
                        {invoiceFileName}
                      </p>
                      <p className="text-sm text-green-700">Factura adjunta</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleViewInvoice}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                    >
                      Ver factura
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReplacing(true)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                    >
                      Reemplazar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteInvoice}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              ) : (
                // SIN FACTURA O REEMPLAZANDO
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                      Subir factura (PDF, JPG, PNG)
                    </label>
                    {isReplacing && (
                      <button
                        type="button"
                        onClick={() => { setIsReplacing(false); setSelectedFile(null); }}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                  />

                  {selectedFile && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-3 rounded-lg">
                      <p className="text-sm text-amber-900 font-medium">
                        {selectedFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={handleUploadInvoice}
                        disabled={isUploading}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploading ? 'Subiendo...' : 'Subir factura'}
                      </button>
                    </div>
                  )}

                  {/* PROGRESS BAR */}
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
              )}

              {/* ERROR DE UPLOAD */}
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

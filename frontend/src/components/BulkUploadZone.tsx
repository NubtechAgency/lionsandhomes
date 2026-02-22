import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { invoiceAPI } from '../services/api';
import { formatCurrency } from '../lib/formatters';
import type { BulkUploadResult, OcrBudgetStatus } from '../types';

interface BulkUploadZoneProps {
  onUploadComplete: () => void;
  budget: OcrBudgetStatus | null;
  onBudgetUpdate: (budget: OcrBudgetStatus) => void;
}

const MAX_FILES = 10;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export default function BulkUploadZone({ onUploadComplete, budget, onBudgetUpdate }: BulkUploadZoneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<BulkUploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => ALLOWED_TYPES.includes(f.type));
    setSelectedFiles(prev => {
      const combined = [...prev, ...newFiles];
      return combined.slice(0, MAX_FILES);
    });
    setResults(null);
    setError(null);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setResults(null);

    try {
      const response = await invoiceAPI.bulkUpload(selectedFiles);
      setResults(response.results);
      onBudgetUpdate(response.budget);
      setSelectedFiles([]);
      onUploadComplete();
    } catch (err: any) {
      setError(err.message || 'Error al subir las facturas');
    } finally {
      setIsUploading(false);
    }
  };

  const budgetLow = budget && budget.budgetCents > 0 && (budget.spentCents / budget.budgetCents) > 0.8;

  return (
    <div className="space-y-4">
      {/* Budget warning */}
      {budgetLow && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} />
          <span>Presupuesto OCR bajo: {formatCurrency((budget!.remainingCents) / 100)} restantes de ${formatCurrency(budget!.budgetCents / 100)}</span>
        </div>
      )}

      {/* Drag & drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-amber-500 bg-amber-50'
            : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/30'
        }`}
      >
        <Upload size={40} className="mx-auto text-gray-400 mb-3" />
        <p className="text-gray-700 font-medium">Arrastra facturas o haz clic para seleccionar</p>
        <p className="text-gray-400 text-sm mt-1">PDF, JPG, PNG, WebP (max 10MB por archivo, hasta {MAX_FILES} archivos)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{selectedFiles.length} archivo(s) seleccionado(s)</h3>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-gray-500 hover:text-red-500"
            >
              Quitar todos
            </button>
          </div>
          {selectedFiles.map((file, i) => (
            <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-amber-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate">{file.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
              <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full mt-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Upload size={18} />
                Subir y analizar ({selectedFiles.length})
              </>
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Resultados</h3>
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                r.status === 'COMPLETED'
                  ? 'bg-green-50 border-green-200'
                  : r.status === 'BUDGET_EXCEEDED'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {r.status === 'COMPLETED' ? (
                <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
              ) : (
                <AlertTriangle size={18} className={r.status === 'BUDGET_EXCEEDED' ? 'text-amber-500 flex-shrink-0' : 'text-red-500 flex-shrink-0'} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{r.fileName}</p>
                {r.status === 'COMPLETED' && r.invoice && (
                  <p className="text-xs text-gray-500">
                    {r.invoice.ocrVendor && `${r.invoice.ocrVendor} · `}
                    {r.invoice.ocrAmount != null && `${formatCurrency(r.invoice.ocrAmount)} · `}
                    {r.suggestions.length > 0
                      ? `${r.suggestions.length} coincidencia(s)`
                      : 'Sin coincidencias'}
                  </p>
                )}
                {r.status === 'BUDGET_EXCEEDED' && (
                  <p className="text-xs text-amber-600">Archivo guardado, OCR pendiente (presupuesto agotado)</p>
                )}
                {r.status === 'FAILED' && (
                  <p className="text-xs text-red-600">{r.error || 'Error al procesar'}</p>
                )}
                {r.status === 'INVALID' && (
                  <p className="text-xs text-red-600">{r.error || 'Archivo no válido'}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

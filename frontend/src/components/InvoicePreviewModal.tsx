import { X, Download, ExternalLink } from 'lucide-react';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

export default function InvoicePreviewModal({ isOpen, onClose, url, fileName }: InvoicePreviewModalProps) {
  if (!isOpen) return null;

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 truncate flex-1 mr-4">{fileName}</h3>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Abrir en nueva pestaña"
            >
              <ExternalLink size={16} />
            </a>
            <a
              href={url}
              download={fileName}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Descargar"
            >
              <Download size={16} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center min-h-[400px]">
          {isPdf ? (
            <iframe
              src={url}
              className="w-full h-full min-h-[70vh]"
              title={fileName}
            />
          ) : isImage ? (
            <img
              src={url}
              alt={fileName}
              className="max-w-full max-h-[80vh] object-contain"
            />
          ) : (
            <div className="text-center p-8">
              <p className="text-gray-500 mb-3">No se puede previsualizar este formato</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
              >
                <Download size={16} /> Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatPercentage } from '../lib/formatters';
import type { Project } from '../types';

interface Props {
  project: Project;
  spent?: number;
}

export default function ProjectCard({ project, spent = 0 }: Props) {
  const navigate = useNavigate();
  const percentage = project.totalBudget > 0 ? (spent / project.totalBudget) * 100 : 0;
  const remaining = project.totalBudget - spent;

  const statusConfig = {
    ACTIVE: { label: 'Activo', bg: 'bg-green-100 text-green-700' },
    COMPLETED: { label: 'Completado', bg: 'bg-blue-100 text-blue-700' },
    ARCHIVED: { label: 'Archivado', bg: 'bg-gray-100 text-gray-600' },
  };

  const status = statusConfig[project.status] || statusConfig.ACTIVE;

  const barColor =
    percentage > 100 ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-amber-700 transition-colors truncate">
            {project.name}
          </h3>
        </div>
        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.bg}`}>
          {status.label}
        </span>
      </div>

      {/* Budget Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{formatPercentage(Math.min(percentage, 999))} consumido</span>
          <span>€{formatCurrency(spent)} / €{formatCurrency(project.totalBudget)}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{project._count?.transactions || 0} transacciones</span>
        <span className={remaining < 0 ? 'text-red-500 font-medium' : ''}>
          {remaining < 0 ? '-' : ''}€{formatCurrency(Math.abs(remaining))} restante
        </span>
      </div>
    </div>
  );
}

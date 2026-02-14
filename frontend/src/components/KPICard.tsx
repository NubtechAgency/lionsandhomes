import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  color?: 'amber' | 'green' | 'red' | 'blue' | 'gray';
  tooltip?: string;
  onClick?: () => void;
}

const colorMap = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
};

const iconColorMap = {
  amber: 'text-amber-500',
  green: 'text-green-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
  gray: 'text-gray-500',
};

export default function KPICard({ title, value, subtitle, icon: Icon, color = 'amber', tooltip, onClick }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={clsx(
        'rounded-xl border p-4 relative',
        colorMap[color],
        onClick && 'cursor-pointer hover:shadow-md transition-shadow'
      )}
      onClick={onClick}
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs mt-1 opacity-70">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={clsx('p-2 rounded-lg bg-white/50', iconColorMap[color])}>
            <Icon size={20} />
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-10 max-w-xs">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  );
}

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../lib/formatters';

interface Props {
  spent: number;
  total: number;
  label: string;
  size?: 'sm' | 'lg';
  fixed?: number;
  variable?: number;
}

export default function DonutChart({ spent, total, label, size = 'sm', fixed, variable }: Props) {
  const noBudget = total <= 0 && spent > 0;
  const percentage = noBudget ? 100 : total > 0 ? Math.min((spent / total) * 100, 999) : 0;
  const remaining = Math.max(total - spent, 0);
  const overBudget = (spent > total && total > 0) || noBudget;

  const getColor = () => {
    if (noBudget) return '#f59e0b'; // amber: spent without budget
    if (percentage >= 100) return '#dc2626'; // red
    if (percentage >= 70) return '#f59e0b'; // amber
    return '#22c55e'; // green
  };

  const color = getColor();

  // 3-segment mode: fixed + variable + remaining
  const hasBreakdown = fixed !== undefined && variable !== undefined;

  const data = overBudget
    ? hasBreakdown
      ? [
          { value: variable || 0, type: 'variable' },
          { value: fixed || 0, type: 'fixed' },
        ]
      : [{ value: 100, type: 'spent' }]
    : hasBreakdown
    ? [
        { value: variable || 0, type: 'variable' },
        { value: fixed || 0, type: 'fixed' },
        { value: remaining, type: 'remaining' },
      ].filter(d => d.value > 0)
    : [
        { value: spent, type: 'spent' },
        { value: remaining, type: 'remaining' },
      ];

  const colorMap: Record<string, string> = {
    variable: '#f97316', // orange-500
    fixed: '#3b82f6',    // blue-500
    spent: color,
    remaining: '#e5e7eb', // gray-200
  };

  const isLarge = size === 'lg';
  const chartSize = isLarge ? 200 : 140;
  const outerRadius = isLarge ? 85 : 58;
  const innerRadius = isLarge ? 65 : 42;

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: chartSize, height: chartSize, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={overBudget && !hasBreakdown ? color : colorMap[d.type || ''] || '#e5e7eb'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold"
            style={{ color, fontSize: isLarge ? '1.5rem' : '1.1rem' }}
          >
            {noBudget ? 'S/P' : `${Math.round(percentage)}%`}
          </span>
        </div>
      </div>
      <p className={`font-semibold text-gray-700 mt-1 ${isLarge ? 'text-base' : 'text-sm'}`}>
        {label}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">
        €{formatCurrency(spent)} / €{formatCurrency(total)}
      </p>
      {hasBreakdown && spent > 0 && (
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] text-gray-400">V: €{formatCurrency(variable || 0)}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-gray-400">F: €{formatCurrency(fixed || 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

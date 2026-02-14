import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../lib/formatters';

interface Props {
  spent: number;
  total: number;
  label: string;
  size?: 'sm' | 'lg';
}

export default function DonutChart({ spent, total, label, size = 'sm' }: Props) {
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

  const data = overBudget
    ? [{ value: 100 }]
    : [
        { value: spent, type: 'spent' },
        { value: remaining, type: 'remaining' },
      ];

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
              {overBudget ? (
                <Cell fill={color} />
              ) : (
                <>
                  <Cell fill={color} />
                  <Cell fill="#e5e7eb" />
                </>
              )}
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
    </div>
  );
}

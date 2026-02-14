import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { CategoryStat } from '../../types';
import { EXPENSE_CATEGORIES } from '../../lib/constants';
import { formatCurrency } from '../../lib/formatters';

interface Props {
  categoryStats: CategoryStat[];
}

const COLORS = {
  budget: '#93c5fd',
  spent: '#f59e0b',
};

export default function BudgetVsSpendingChart({ categoryStats }: Props) {
  const data = categoryStats
    .filter(s => s.budget > 0 || s.spent > 0)
    .map(s => {
      const cat = EXPENSE_CATEGORIES.find(c => c.key === s.category);
      return {
        name: cat?.label || s.category,
        Presupuesto: s.budget,
        Gastado: s.spent,
      };
    });

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Sin datos de categorías
      </div>
    );
  }

  return (
    <div>
      {/* Custom legend */}
      <div className="flex items-center gap-5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.budget }} />
          <span className="text-sm font-medium text-gray-600">Presupuesto</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.spent }} />
          <span className="text-sm font-medium text-gray-600">Gastado</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={data.length * 60 + 20}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 13, fill: '#1f2937', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={160}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`€${formatCurrency(value)}`, name]}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              fontSize: '13px',
            }}
          />
          <Bar dataKey="Presupuesto" fill={COLORS.budget} radius={[0, 4, 4, 0]} maxBarSize={20} />
          <Bar dataKey="Gastado" fill={COLORS.spent} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

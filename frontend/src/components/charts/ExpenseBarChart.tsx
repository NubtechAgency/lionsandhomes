import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { startOfWeek, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Transaction } from '../../types';
import { formatCurrency } from '../../lib/formatters';
import clsx from 'clsx';

type TimeFilter = 'day' | 'week' | 'month';

interface Props {
  transactions: Transaction[];
}

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'day', label: 'Días' },
  { key: 'week', label: 'Semanas' },
  { key: 'month', label: 'Meses' },
];

export default function ExpenseBarChart({ transactions }: Props) {
  const [filter, setFilter] = useState<TimeFilter>('month');

  const { data, totalSpent } = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0);
    if (expenses.length === 0) return { data: [], totalSpent: 0 };

    const total = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const grouped: Record<string, number> = {};

    // Sort expenses by date ascending for proper grouping
    const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(t => {
      const date = parseISO(t.date);
      let key: string;

      switch (filter) {
        case 'day':
          key = format(date, 'dd MMM', { locale: es });
          break;
        case 'week': {
          const weekStart = startOfWeek(date, { weekStartsOn: 1 });
          key = format(weekStart, "'Sem' w", { locale: es });
          break;
        }
        case 'month':
          key = format(date, 'MMM yy', { locale: es });
          break;
      }

      grouped[key] = (grouped[key] || 0) + Math.abs(t.amount);
    });

    const entries = Object.entries(grouped)
      .map(([name, value]) => ({ name, total: Math.round(value * 100) / 100 }));

    // Limit display based on filter
    let sliced;
    if (filter === 'day') {
      sliced = entries.slice(-14); // Last 14 days
    } else if (filter === 'week') {
      sliced = entries.slice(-12); // Last 12 weeks
    } else {
      sliced = entries.slice(-8); // Last 8 months
    }

    return { data: sliced, totalSpent: total };
  }, [transactions, filter]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Sin datos de gastos
      </div>
    );
  }

  return (
    <div>
      {/* Header with total and filters */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-2xl font-bold text-gray-900">€{formatCurrency(totalSpent)}</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filter === f.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Area Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
          />
          <Tooltip
            formatter={(value: number) => [`€${formatCurrency(value)}`, 'Gasto']}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              fontSize: '13px',
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#ea580c"
            strokeWidth={2.5}
            fill="url(#expenseGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

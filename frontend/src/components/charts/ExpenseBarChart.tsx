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
    const grouped: Record<string, { total: number; fixed: number; variable: number }> = {};

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

      if (!grouped[key]) grouped[key] = { total: 0, fixed: 0, variable: 0 };
      const amt = Math.abs(t.amount);
      grouped[key].total += amt;
      if (t.isFixed) grouped[key].fixed += amt;
      else grouped[key].variable += amt;
    });

    const entries = Object.entries(grouped)
      .map(([name, v]) => ({
        name,
        total: Math.round(v.total * 100) / 100,
        variable: Math.round(v.variable * 100) / 100,
        fixed: Math.round(v.fixed * 100) / 100,
      }));

    let sliced;
    if (filter === 'day') {
      sliced = entries.slice(-14);
    } else if (filter === 'week') {
      sliced = entries.slice(-12);
    } else {
      sliced = entries.slice(-8);
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
          <p className="text-2xl font-bold text-gray-900">&euro;{formatCurrency(totalSpent)}</p>
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

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-gray-500" />
          <span className="text-xs text-gray-500">Total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
          <span className="text-xs text-gray-500">Variables</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          <span className="text-xs text-gray-500">Fijos</span>
        </div>
      </div>

      {/* Area Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6b7280" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#6b7280" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="variableGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fixedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
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
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = { total: 'Total', variable: 'Variables', fixed: 'Fijos' };
              return [`\u20AC${formatCurrency(value)}`, labels[name] || name];
            }}
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
            stroke="#6b7280"
            strokeWidth={2}
            fill="url(#totalGradient)"
            strokeDasharray="5 3"
          />
          <Area
            type="monotone"
            dataKey="variable"
            stroke="#ea580c"
            strokeWidth={2.5}
            fill="url(#variableGradient)"
          />
          <Area
            type="monotone"
            dataKey="fixed"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#fixedGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

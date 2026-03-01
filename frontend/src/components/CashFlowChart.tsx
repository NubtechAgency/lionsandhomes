import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceDot,
} from 'recharts';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Target, TrendingUp, ArrowDownRight, ShieldAlert, CalendarX } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../lib/formatters';
import type { CashFlowSummaryMonth } from '../types';

interface Props {
  summary: CashFlowSummaryMonth[];
}

interface Insight {
  type: string;
  priority: number;
  label: string;
  description: string;
  value: string;
  color: 'red' | 'green' | 'amber' | 'blue';
  icon: typeof AlertTriangle;
}

interface ChartDataPoint extends CashFlowSummaryMonth {
  name: string;
  expenseNeg: number; // -expense for below-zero bar rendering
}

/**
 * Formats a signed currency: +€5.000,00 or -€5.000,00
 */
function formatSignedCurrency(amount: number): string {
  if (amount >= 0) return `+€${formatCurrency(amount)}`;
  return `-€${formatCurrency(Math.abs(amount))}`;
}

// ─── Custom Tooltip ──────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const income = payload.find((p: any) => p.dataKey === 'income')?.value ?? 0;
  const expenseNeg = payload.find((p: any) => p.dataKey === 'expenseNeg')?.value ?? 0;
  const expense = Math.abs(expenseNeg); // Show as positive in tooltip
  const cumulative = payload.find((p: any) => p.dataKey === 'cumulative')?.value ?? 0;
  const net = income - expense;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2 capitalize">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-green-500" />
            Cobros
          </span>
          <span className="font-medium text-green-700">&euro;{formatCurrency(income)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-red-400" />
            Pagos
          </span>
          <span className="font-medium text-red-700">&euro;{formatCurrency(expense)}</span>
        </div>
        <div className="border-t border-gray-100 pt-1 flex items-center justify-between gap-6">
          <span className="text-gray-500">Neto mes</span>
          <span className={clsx('font-medium', net >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatSignedCurrency(net)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-blue-600 rounded" />
            Acumulado
          </span>
          <span className={clsx('font-bold', cumulative >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {formatSignedCurrency(cumulative)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Annotation Dot (SVG) ────────────────────────────────────────
function AnnotationDot({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  const fill = color === 'red' ? '#ef4444' : '#22c55e';
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={fill} fillOpacity={0.2} stroke={fill} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={3} fill={fill} />
    </g>
  );
}

// ─── Y-axis tick formatter (handles positive and negative) ───────
function formatAxisTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const formatted = `${(abs / 1000).toFixed(0)}K`;
    return v < 0 ? `-${formatted}` : formatted;
  }
  return `${v}`;
}

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════
export default function CashFlowChart({ summary }: Props) {
  const computed = useMemo(() => {
    if (summary.length === 0) {
      return {
        data: [] as ChartDataPoint[],
        insights: [] as Insight[],
        maxRiskPoint: null as ChartDataPoint | null,
        breakEvenPoint: null as ChartDataPoint | null,
        axisDomain: [0, 1] as [number, number],
        zeroOffset: 0.5,
      };
    }

    // ── 1. Process chart data ──
    const chartData: ChartDataPoint[] = summary.map(m => {
      const d = parse(m.month, 'yyyy-MM', new Date());
      return {
        ...m,
        name: format(d, 'MMM yy', { locale: es }),
        expenseNeg: -m.expense, // Inverted: bars go below 0
      };
    });

    // ── 2. Compute single Y-axis domain (must include 0) ──
    const allValues = [
      ...chartData.map(d => d.income),
      ...chartData.map(d => d.expenseNeg),
      ...chartData.map(d => d.cumulative),
      0,
    ];
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const range = rawMax - rawMin || 1;
    const pad = range * 0.08;
    const domain: [number, number] = [
      Math.floor((rawMin - pad) / 5000) * 5000,
      Math.ceil((rawMax + pad) / 5000) * 5000,
    ];

    // Gradient zero-offset (fraction from TOP where y=0 falls)
    const gRange = domain[1] - domain[0];
    const zOffset = gRange === 0 ? 0.5 : Math.max(0, Math.min(1, domain[1] / gRange));

    // ── 3. Compute ALL dynamic insights ──
    const allInsights: Insight[] = [];
    let riskPoint: ChartDataPoint | null = null;
    let evenPoint: ChartDataPoint | null = null;

    // --- Insight: Máx. Exposición de Riesgo ---
    // Trigger: cumulative goes negative at any point
    let minCumIdx = 0;
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].cumulative < chartData[minCumIdx].cumulative) minCumIdx = i;
    }
    if (chartData[minCumIdx].cumulative < 0) {
      riskPoint = chartData[minCumIdx];
      allInsights.push({
        type: 'max-risk',
        priority: 1,
        label: 'Máx. Exposición',
        description: `En ${riskPoint.name} el flujo alcanza -€${formatCurrency(Math.abs(riskPoint.cumulative))}. Necesitarás esta cantidad disponible en caja.`,
        value: `€${formatCurrency(Math.abs(riskPoint.cumulative))}`,
        color: 'red',
        icon: AlertTriangle,
      });
    }

    // --- Insight: Meses en Negativo (consecutive streak) ---
    // Trigger: cumulative is negative for 1+ consecutive months
    {
      let curStreak = 0, bestStreak = 0, bestStart = 0, bestEnd = 0, streakStart = 0;
      for (let i = 0; i < chartData.length; i++) {
        if (chartData[i].cumulative < 0) {
          if (curStreak === 0) streakStart = i;
          curStreak++;
          if (curStreak > bestStreak) {
            bestStreak = curStreak;
            bestStart = streakStart;
            bestEnd = i;
          }
        } else {
          curStreak = 0;
        }
      }
      if (bestStreak > 0) {
        const startName = chartData[bestStart].name;
        const endName = chartData[bestEnd].name;
        allInsights.push({
          type: 'neg-duration',
          priority: 2,
          label: 'Periodo en Rojo',
          description: bestStreak === 1
            ? `En ${startName} el flujo acumulado es negativo. Asegura liquidez para ese mes.`
            : `De ${startName} a ${endName} (${bestStreak} meses) el flujo acumulado es negativo. Planifica financiación para este periodo.`,
          value: `${bestStreak} ${bestStreak === 1 ? 'mes' : 'meses'}`,
          color: bestStreak >= 3 ? 'red' : 'amber',
          icon: CalendarX,
        });
      }
    }

    // --- Insight: Punto de Equilibrio (break-even) ---
    // Trigger: cumulative transitions from negative to positive
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i - 1].cumulative < 0 && chartData[i].cumulative >= 0) {
        evenPoint = chartData[i];
        allInsights.push({
          type: 'break-even',
          priority: 3,
          label: 'Break-even',
          description: `En ${evenPoint.name} el flujo se recupera y vuelve a positivo (+€${formatCurrency(evenPoint.cumulative)}).`,
          value: evenPoint.name.charAt(0).toUpperCase() + evenPoint.name.slice(1),
          color: 'green',
          icon: Target,
        });
        break;
      }
    }

    // --- Insight: Colchón Recomendado ---
    // Trigger: same as max risk (cumulative goes negative)
    // Value: max exposure + 20% safety margin
    if (riskPoint) {
      const cushion = Math.abs(riskPoint.cumulative) * 1.2;
      allInsights.push({
        type: 'cushion',
        priority: 4,
        label: 'Reserva Sugerida',
        description: `Mantén al menos esta cantidad en caja para cubrir el periodo negativo con un 20% de margen de seguridad.`,
        value: `€${formatCurrency(cushion)}`,
        color: 'blue',
        icon: ShieldAlert,
      });
    }

    // --- Insight: Meses Deficitarios (monthly net < 0) ---
    // Trigger: any month where expense > income
    {
      const deficitMonths = chartData.filter(d => d.net < 0);
      if (deficitMonths.length > 0) {
        const worstMonth = deficitMonths.reduce((a, b) => a.net < b.net ? a : b);
        allInsights.push({
          type: 'deficit-months',
          priority: 5,
          label: 'Meses Deficitarios',
          description: `${deficitMonths.length} de ${chartData.length} meses tienen más pagos que cobros. El peor: ${worstMonth.name} (-€${formatCurrency(Math.abs(worstMonth.net))}).`,
          value: `${deficitMonths.length} de ${chartData.length}`,
          color: 'amber',
          icon: ArrowDownRight,
        });
      }
    }

    // --- Insight: Mayor Salida ---
    // Trigger: always (if there are expenses)
    {
      let maxExpIdx = 0;
      for (let i = 1; i < chartData.length; i++) {
        if (chartData[i].expense > chartData[maxExpIdx].expense) maxExpIdx = i;
      }
      if (chartData[maxExpIdx].expense > 0) {
        allInsights.push({
          type: 'max-expense',
          priority: 6,
          label: 'Mayor Salida',
          description: `${chartData[maxExpIdx].name} es el mes con mayor volumen de pagos previsto.`,
          value: `€${formatCurrency(chartData[maxExpIdx].expense)}`,
          color: 'amber',
          icon: ArrowDownRight,
        });
      }
    }

    // --- Insight: Posición Final ---
    // Trigger: always
    {
      const last = chartData[chartData.length - 1];
      allInsights.push({
        type: 'final-position',
        priority: 7,
        label: 'Posición Final',
        description: `Flujo acumulado previsto al cierre del periodo (${last.name}).`,
        value: formatSignedCurrency(last.cumulative),
        color: last.cumulative >= 0 ? 'green' : 'red',
        icon: TrendingUp,
      });
    }

    // ── 4. Select top 4 insights by priority ──
    const selectedInsights = allInsights
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4);

    return {
      data: chartData,
      insights: selectedInsights,
      maxRiskPoint: riskPoint,
      breakEvenPoint: evenPoint,
      axisDomain: domain,
      zeroOffset: zOffset,
    };
  }, [summary]);

  const { data, insights, maxRiskPoint, breakEvenPoint, axisDomain, zeroOffset } = computed;

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-center h-48 text-gray-400">
          Sin datos para mostrar. Crea entradas de flujo de caja para ver el gráfico.
        </div>
      </div>
    );
  }

  const insightColorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500', value: 'text-red-800' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-500', value: 'text-green-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500', value: 'text-amber-800' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-500', value: 'text-blue-800' },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      {/* Legend */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
          <span className="text-xs text-gray-500">Cobros</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
          <span className="text-xs text-gray-500">Pagos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-blue-600 rounded" />
          <span className="text-xs text-gray-500">Cash Flow acumulado</span>
        </div>
        {maxRiskPoint && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-red-100" />
            <span className="text-xs text-gray-500">Máx. riesgo</span>
          </div>
        )}
        {breakEvenPoint && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-green-500 bg-green-100" />
            <span className="text-xs text-gray-500">Break-even</span>
          </div>
        )}
      </div>

      {/* ─── Combined Chart ─── */}
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <defs>
            {/* Gradient: blue above y=0, red below y=0 */}
            <linearGradient id="cashFlowAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#2563eb" stopOpacity={0.03} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" stopOpacity={0.03} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />

          {/* Single Y-axis for bars + line (includes negative range) */}
          <YAxis
            domain={axisDomain}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatAxisTick}
            width={55}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* ── Zero reference line (prominent) ── */}
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />

          {/* ── Area fill: blue above 0, red below 0 (behind everything) ── */}
          <Area
            type="monotone"
            dataKey="cumulative"
            fill="url(#cashFlowAreaGradient)"
            stroke="none"
            baseValue={0}
            isAnimationActive={false}
          />

          {/* ── Income bars (above zero — green) ── */}
          <Bar dataKey="income" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={18} />

          {/* ── Expense bars (below zero — red, inverted) ── */}
          <Bar dataKey="expenseNeg" fill="#f87171" radius={[0, 0, 3, 3]} barSize={18} />

          {/* ── Cumulative cash flow line with dots ── */}
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
          />

          {/* ── Annotation: Max risk exposure ── */}
          {maxRiskPoint && (
            <ReferenceDot
              x={maxRiskPoint.name}
              y={maxRiskPoint.cumulative}
              shape={(props: any) => <AnnotationDot cx={props.cx} cy={props.cy} color="red" />}
            />
          )}

          {/* ── Annotation: Break-even point ── */}
          {breakEvenPoint && (
            <ReferenceDot
              x={breakEvenPoint.name}
              y={breakEvenPoint.cumulative}
              shape={(props: any) => <AnnotationDot cx={props.cx} cy={props.cy} color="green" />}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ─── Dynamic Insights Panel ─── */}
      {insights.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Indicadores clave
          </p>
          <div className={clsx(
            'grid gap-3',
            insights.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4',
          )}>
            {insights.map(insight => {
              const colors = insightColorMap[insight.color];
              const Icon = insight.icon;
              return (
                <div
                  key={insight.type}
                  className={clsx('rounded-lg border p-3', colors.bg, colors.border)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={colors.icon} />
                    <span className={clsx('text-xs font-semibold', colors.text)}>{insight.label}</span>
                  </div>
                  <p className={clsx('text-lg font-bold', colors.value)}>{insight.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{insight.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

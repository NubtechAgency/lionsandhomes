import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, isSameDay, isToday,
  addMonths, subMonths, isBefore, startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { CashFlowEntry } from '../types';

interface Props {
  entries: CashFlowEntry[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateClick: (date: Date) => void;
  onEntryClick: (entry: CashFlowEntry) => void;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function CashFlowCalendar({ entries, currentMonth, onMonthChange, onDateClick, onEntryClick }: Props) {
  const { days, paddingDays } = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const allDays = eachDayOfInterval({ start, end });
    // getDay returns 0=Sun, we want 0=Mon
    let dow = getDay(start) - 1;
    if (dow < 0) dow = 6;
    return { days: allDays, paddingDays: dow };
  }, [currentMonth]);

  // Group entries by date string
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CashFlowEntry[]>();
    for (const entry of entries) {
      const key = entry.date.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [entries]);

  const today = startOfDay(new Date());

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      {/* Header: navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onMonthChange(subMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h3>
        <button
          onClick={() => onMonthChange(addMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {/* Padding for first week */}
        {Array.from({ length: paddingDays }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[70px]" />
        ))}

        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEntries = entriesByDate.get(dateKey) || [];
          const incomeEntries = dayEntries.filter(e => e.type === 'INCOME');
          const expenseEntries = dayEntries.filter(e => e.type === 'EXPENSE');
          const isRealized = isBefore(day, today) || isSameDay(day, today);
          const isTodayDate = isToday(day);

          const hasIncome = incomeEntries.length > 0;
          const hasExpense = expenseEntries.length > 0;
          const hasBoth = hasIncome && hasExpense;

          return (
            <div
              key={dateKey}
              onClick={() => onDateClick(day)}
              className={clsx(
                'min-h-[70px] p-1.5 rounded-lg border cursor-pointer transition-colors',
                isTodayDate && 'ring-2 ring-amber-400',
                // Background color based on entry type
                hasBoth
                  ? 'bg-gradient-to-br from-green-100 to-red-100 border-amber-300'
                  : hasIncome
                    ? 'bg-green-100 border-green-300'
                    : hasExpense
                      ? 'bg-red-100 border-red-300'
                      : isTodayDate
                        ? 'border-amber-300 bg-amber-50/50'
                        : 'border-gray-100 hover:bg-gray-50',
                isRealized && dayEntries.length > 0 && 'opacity-60'
              )}
            >
              <div className={clsx(
                'text-xs font-medium mb-1',
                hasBoth ? 'text-amber-800'
                  : hasIncome ? 'text-green-800'
                  : hasExpense ? 'text-red-800'
                  : isTodayDate ? 'text-amber-700'
                  : 'text-gray-700'
              )}>
                {format(day, 'd')}
              </div>

              {/* Entry indicators */}
              <div className="space-y-0.5">
                {hasIncome && (
                  <div
                    onClick={e => { e.stopPropagation(); if (incomeEntries.length === 1) onEntryClick(incomeEntries[0]); }}
                    className="flex items-center gap-1"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-600 flex-shrink-0" />
                    <span className="text-[10px] text-green-800 font-medium truncate">
                      {incomeEntries.length === 1
                        ? incomeEntries[0].description.slice(0, 12)
                        : `${incomeEntries.length} cobros`
                      }
                    </span>
                  </div>
                )}
                {hasExpense && (
                  <div
                    onClick={e => { e.stopPropagation(); if (expenseEntries.length === 1) onEntryClick(expenseEntries[0]); }}
                    className="flex items-center gap-1"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0" />
                    <span className="text-[10px] text-red-800 font-medium truncate">
                      {expenseEntries.length === 1
                        ? expenseEntries[0].description.slice(0, 12)
                        : `${expenseEntries.length} pagos`
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500">Cobros</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-gray-500">Pagos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-amber-300 bg-amber-50" />
          <span className="text-xs text-gray-500">Hoy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 opacity-60">Atenuado</span>
          <span className="text-xs text-gray-400">= Realizada</span>
        </div>
      </div>
    </div>
  );
}

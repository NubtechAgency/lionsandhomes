import { PROJECT_CATEGORIES } from '../lib/constants';
import { formatCurrency } from '../lib/formatters';
import type { CategoryBudgets } from '../types';

interface Props {
  categoryBudgets: CategoryBudgets;
  spendingByCategory: Record<string, number>;
}

export default function CategoryProgressList({ categoryBudgets, spendingByCategory }: Props) {
  return (
    <div className="space-y-4">
      {PROJECT_CATEGORIES.map(cat => {
        const budget = categoryBudgets[cat.key] || 0;
        const spent = spendingByCategory[cat.key] || 0;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;

        const barColor =
          percentage > 100 ? 'bg-red-500' :
          percentage > 80 ? 'bg-yellow-500' :
          'bg-amber-500';

        return (
          <div key={cat.key} className="bg-white rounded-lg border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">{cat.label}</h4>
                {cat.description && (
                  <p className="text-xs text-gray-400">{cat.description}</p>
                )}
              </div>
              <span className="text-sm font-medium text-gray-600">
                €{formatCurrency(spent)} / €{formatCurrency(budget)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`${barColor} h-2.5 rounded-full transition-all duration-300`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">
                {percentage > 0 ? `${Math.round(percentage)}% consumido` : 'Sin gastos'}
              </span>
              {budget > 0 && (
                <span className="text-xs text-gray-400">
                  Restante: €{formatCurrency(Math.max(budget - spent, 0))}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

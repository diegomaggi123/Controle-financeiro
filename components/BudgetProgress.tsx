import React, { useMemo } from 'react';
import { Transaction, CategoryData } from '../types';
import { formatCurrency, getCategoryColor } from '../utils';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface BudgetProgressProps {
  transactions: Transaction[];
  categories: CategoryData[];
}

const BudgetProgress: React.FC<BudgetProgressProps> = ({ transactions, categories }) => {
  const budgetData = useMemo(() => {
    // Filtrar apenas categorias que têm orçamento definido (> 0)
    const categoriesWithBudget = categories.filter(c => c.budget && c.budget > 0);
    
    // Calcular gastos atuais por categoria
    const expenses = transactions.filter(t => t.type === 'expense');
    const spendingMap = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    return categoriesWithBudget.map(cat => {
      const spent = spendingMap[cat.name] || 0;
      const remaining = cat.budget! - spent;
      const percentage = Math.min((spent / cat.budget!) * 100, 100);
      const isOverBudget = spent > cat.budget!;

      return {
        ...cat,
        spent,
        remaining,
        percentage,
        isOverBudget
      };
    }).sort((a, b) => b.percentage - a.percentage); // Ordenar pelos que estão mais perto de estourar
  }, [transactions, categories]);

  if (budgetData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 uppercase">Planejamento Mensal</h2>
        <span className="text-xs text-gray-500 uppercase">Gasto vs Planejado</span>
      </div>
      <div className="p-4 space-y-5">
        {budgetData.map(item => (
          <div key={item.id}>
            <div className="flex justify-between items-end mb-1">
              <div className="flex items-center gap-2">
                 <span className={`inline-block w-2 h-2 rounded-full ${item.isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}></span>
                 <span className="font-medium text-gray-700 uppercase">{item.name}</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${item.isOverBudget ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatCurrency(item.spent)}
                </span>
                <span className="text-xs text-gray-400 mx-1">/</span>
                <span className="text-xs text-gray-500">{formatCurrency(item.budget || 0)}</span>
              </div>
            </div>
            
            {/* Barra de Progresso */}
            <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                        item.isOverBudget ? 'bg-red-500' : 
                        item.percentage > 75 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${item.percentage}%` }}
                ></div>
            </div>

            {/* Texto de Apoio (Restante) */}
            <div className="flex justify-between items-center mt-1">
                 <span className="text-xs text-gray-400 uppercase">
                    {item.percentage.toFixed(0)}% Utilizado
                 </span>
                 <span className={`text-xs font-medium uppercase flex items-center gap-1 ${item.remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.remaining < 0 ? (
                        <><AlertCircle size={10} /> Estourou: {formatCurrency(Math.abs(item.remaining))}</>
                    ) : (
                        <><CheckCircle size={10} /> Resta: {formatCurrency(item.remaining)}</>
                    )}
                 </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BudgetProgress;
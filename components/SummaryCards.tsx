import React, { useMemo } from 'react';
import { Transaction, CategoryData } from '../types';
import { formatCurrency, normalizeCurrency } from '../utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

interface SummaryCardsProps {
  transactions: Transaction[];
  categories: CategoryData[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions, categories }) => {
  const summary = useMemo(() => {
    // 1. Calcular Receitas Reais
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    // 2. Mapear gastos reais por categoria neste mês
    const expensesMap = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    // 3. Calcular Despesa Comprometida (Lógica: O maior valor entre o Gasto Real e a Meta)
    let committedExpense = 0;
    const processedCategories = new Set<string>();

    // Passa por todas as categorias cadastradas
    categories.forEach(cat => {
      const budget = cat.budget || 0;
      const actual = expensesMap[cat.name] || 0;
      
      // O "custo" dessa categoria para o saldo é o maior entre a meta e o real
      committedExpense += Math.max(budget, actual);
      
      processedCategories.add(cat.name);
    });

    // Adiciona gastos de categorias que podem não estar na lista de configurações (ex: excluídas ou "Outros" sem meta)
    Object.keys(expensesMap).forEach(catName => {
      if (!processedCategories.has(catName)) {
        committedExpense += expensesMap[catName];
      }
    });

    return { 
        income: normalizeCurrency(income), 
        expense: normalizeCurrency(committedExpense) 
    };
  }, [transactions, categories]);

  const balance = normalizeCurrency(summary.income - summary.expense);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden flex items-center justify-between">
        <div>
           <div className="mb-1">
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Receitas</h3>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(summary.income)}</p>
        </div>
        <div className="bg-green-50 p-3 rounded-full">
            <ArrowUpCircle className="text-green-600 opacity-80" size={32} />
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden flex items-center justify-between">
         <div>
           <div className="mb-1">
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Comprometido</h3>
            <span className="text-[10px] text-gray-400 uppercase">(Gasto Real ou Meta)</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(summary.expense)}</p>
         </div>
         <div className="bg-red-50 p-3 rounded-full">
            <ArrowDownCircle className="text-red-600 opacity-80" size={32} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden flex items-center justify-between">
         <div>
           <div className="mb-1">
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Saldo Livre</h3>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(balance)}
          </p>
         </div>
         <div className="bg-blue-50 p-3 rounded-full">
            <Wallet className="text-blue-600 opacity-80" size={32} />
        </div>
      </div>
    </div>
  );
};

export default SummaryCards;
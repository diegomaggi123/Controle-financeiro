import React, { useMemo } from 'react';
import { Transaction, CategoryData } from '../types';
import { formatCurrency, normalizeCurrency } from '../utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet, Info } from 'lucide-react';

interface SummaryCardsProps {
  transactions: Transaction[];
  categories: CategoryData[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions, categories }) => {
  const summary = useMemo(() => {
    // 1. Calcular Receitas Reais + Descontos em Folha (para compor a Receita Bruta)
    const incomes = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const payrollDeductions = transactions
      .filter(t => t.type === 'payroll_deduction')
      .reduce((sum, t) => sum + t.amount, 0);

    const grossIncome = incomes + payrollDeductions;

    // 2. Mapear gastos reais por categoria
    // Inclui despesas normais e descontos em folha
    const expensesMap = transactions
      .filter(t => t.type === 'expense' || t.type === 'payroll_deduction')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    // 3. Calcular Despesa Comprometida (Maior entre Gasto Real e Meta)
    let committedExpense = 0;
    const processedCategories = new Set<string>();

    categories.forEach(cat => {
      const budget = cat.budget || 0;
      const actual = expensesMap[cat.name] || 0;
      committedExpense += Math.max(budget, actual);
      processedCategories.add(cat.name);
    });

    Object.keys(expensesMap).forEach(catName => {
      if (!processedCategories.has(catName)) {
        committedExpense += expensesMap[catName];
      }
    });

    return { 
        income: normalizeCurrency(grossIncome), 
        expense: normalizeCurrency(committedExpense),
        totalDeductions: normalizeCurrency(payrollDeductions)
    };
  }, [transactions, categories]);

  const balance = normalizeCurrency(summary.income - summary.expense);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden flex items-center justify-between">
        <div>
           <div className="mb-1">
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Receita Bruta</h3>
            {summary.totalDeductions > 0 && (
                <span className="text-[10px] text-indigo-600 font-bold uppercase">(Incl. Desc. Folha)</span>
            )}
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
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Total Comprometido</h3>
            <span className="text-[10px] text-gray-400 uppercase">(Meta ou Gasto Real)</span>
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
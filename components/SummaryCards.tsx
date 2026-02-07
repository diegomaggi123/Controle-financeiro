import React, { useMemo } from 'react';
import { Transaction, CategoryData } from '../types';
import { formatCurrency, normalizeCurrency } from '../utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet, CreditCard } from 'lucide-react';

interface SummaryCardsProps {
  transactions: Transaction[];
  categories: CategoryData[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions, categories }) => {
  const summary = useMemo(() => {
    // 1. Calcular Receitas Reais + Descontos em Folha (Receita Bruta)
    const incomes = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

    const payrollDeductions = transactions
      .filter(t => t.type === 'payroll_deduction')
      .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

    const grossIncome = normalizeCurrency(incomes + payrollDeductions);

    // 2. Calcular Total apenas em Cartão de Crédito para visualização
    const creditCardTotal = transactions
      .filter(t => t.type === 'expense' && t.isCreditCard === true)
      .reduce((sum, t) => normalizeCurrency(sum + t.amount), 0);

    // 3. Mapear gastos reais por categoria (incluindo descontos em folha)
    const expensesMap = transactions
      .filter(t => t.type === 'expense' || t.type === 'payroll_deduction')
      .reduce((acc, t) => {
        acc[t.category] = normalizeCurrency((acc[t.category] || 0) + t.amount);
        return acc;
      }, {} as Record<string, number>);

    // 4. ALGORITMO DE COMPROMETIMENTO (REGRA DE NEGÓCIO CRUCIAL)
    // O comprometimento é a soma do maior valor entre (Meta) e (Gasto Real) para cada categoria.
    let committedExpense = 0;
    const processedCategories = new Set<string>();

    categories.forEach(cat => {
      const budget = normalizeCurrency(cat.budget || 0);
      const actual = normalizeCurrency(expensesMap[cat.name] || 0);
      // Se gastou mais que a meta, conta o gasto. Se gastou menos, conta a meta (reserva).
      committedExpense = normalizeCurrency(committedExpense + Math.max(budget, actual));
      processedCategories.add(cat.name);
    });

    // Adicionar categorias "avulsas" que não estão no cadastro oficial mas têm lançamentos
    Object.keys(expensesMap).forEach(catName => {
      if (!processedCategories.has(catName)) {
        committedExpense = normalizeCurrency(committedExpense + expensesMap[catName]);
      }
    });

    return { 
        income: grossIncome, 
        expense: committedExpense,
        totalDeductions: payrollDeductions,
        creditCardTotal: creditCardTotal
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
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 uppercase">(Meta ou Real)</span>
                {summary.creditCardTotal > 0 && (
                    <span className="text-[10px] text-blue-600 font-bold uppercase flex items-center gap-1">
                        <CreditCard size={10} /> {formatCurrency(summary.creditCardTotal)} em cartão
                    </span>
                )}
            </div>
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
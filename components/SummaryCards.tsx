import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { formatCurrency } from '../utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

interface SummaryCardsProps {
  transactions: Transaction[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {
  const summary = useMemo(() => {
    return transactions.reduce(
      (acc, t) => {
        if (t.type === 'income') acc.income += t.amount;
        else acc.expense += t.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [transactions]);

  const balance = summary.income - summary.expense;

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
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Despesas</h3>
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
            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider">Saldo</h3>
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
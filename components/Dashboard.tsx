import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { formatCurrency, normalizeCurrency } from '../utils';

interface DashboardProps {
  transactions: Transaction[];
  currentMonthName: string;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#06b6d4', '#84cc16', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ transactions }) => {
  
  // 1. Calcular a Renda Total do Mês (Base para a porcentagem)
  const totalIncome = useMemo(() => {
    const sum = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);
    return normalizeCurrency(sum);
  }, [transactions]);

  // 2. Calcular Despesas Totais (Apenas para referência ou fallback)
  const totalExpenses = useMemo(() => {
    const sum = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    return normalizeCurrency(sum);
  }, [transactions]);

  // Helper para calcular a porcentagem correta
  const calculatePercentage = (value: number) => {
    if (totalIncome > 0) {
      const pct = (value / totalIncome) * 100;
      return pct.toFixed(1) + '% da Renda';
    } 
    else if (totalExpenses > 0) {
      const pct = (value / totalExpenses) * 100;
      return pct.toFixed(1) + '% dos Gastos';
    }
    return '0%';
  };

  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    
    const grouped = expenses.reduce((acc, t) => {
      acc[t.category] = normalizeCurrency((acc[t.category] || 0) + t.amount);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: calculatePercentage(value)
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, totalIncome, totalExpenses]);

  const establishmentData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    
    const grouped = expenses.reduce((acc, t) => {
      acc[t.description] = normalizeCurrency((acc[t.description] || 0) + t.amount);
      return acc;
    }, {} as Record<string, number>);

    let sortedData = Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: ''
      }))
      .sort((a, b) => b.value - a.value);

    if (sortedData.length > 10) {
      const top10 = sortedData.slice(0, 10);
      const others = sortedData.slice(10);
      const othersTotal = normalizeCurrency(others.reduce((acc, item) => acc + item.value, 0));

      top10.push({
        name: 'OUTROS LOCAIS',
        value: othersTotal,
        percentage: ''
      });

      sortedData = top10;
    }

    return sortedData.map(item => ({
      ...item,
      percentage: calculatePercentage(item.value)
    }));
  }, [transactions, totalIncome, totalExpenses]);

  const renderList = (data: typeof categoryData, title: string) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
        <div className="p-4 border-b bg-gray-50">
            <h3 className="text-lg font-bold text-gray-800 uppercase">{title}</h3>
            <p className="text-xs text-gray-500 uppercase mt-0.5">% baseada na <strong className="text-blue-600">Renda Mensal</strong></p>
        </div>
        
        <div className="flex-1 overflow-y-auto max-h-[400px]">
            {data.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                    {data.map((item, index) => (
                        <li key={index} className="flex justify-between items-center p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                                {/* Color Indicator Dot */}
                                <div 
                                    className="w-3 h-3 rounded-full shrink-0" 
                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                ></div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-800 text-sm uppercase">{item.name}</span>
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit uppercase tracking-wide">
                                        {item.percentage}
                                    </span>
                                </div>
                            </div>
                            <span className="font-bold text-gray-700 text-sm whitespace-nowrap">
                                {formatCurrency(item.value)}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 uppercase text-sm">
                    Sem despesas neste mês
                </div>
            )}
        </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
      {renderList(categoryData, 'Por Categoria')}
      {renderList(establishmentData, 'Por Local')}
    </div>
  );
};

export default Dashboard;
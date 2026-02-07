import React, { useMemo } from 'react';
import { Transaction, CategoryData, MonthlyBudget } from '../types';
import { formatCurrency, getMonthYearKey, normalizeCurrency } from '../utils';
import { format, startOfYear, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileSpreadsheet, FileText, ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';

interface AnnualComparisonProps {
  transactions: Transaction[];
  currentYear: Date;
  categories: CategoryData[];
  monthlyBudgets: MonthlyBudget[];
  onExportExcel: () => void;
  onExportPDF: () => void;
}

const AnnualComparison: React.FC<AnnualComparisonProps> = ({ 
    transactions, 
    currentYear, 
    categories, 
    monthlyBudgets,
    onExportExcel, 
    onExportPDF 
}) => {
  const annualData = useMemo(() => {
    const start = startOfYear(currentYear);
    const months = [];

    for (let i = 0; i < 12; i++) {
        const date = addMonths(start, i);
        const key = getMonthYearKey(date);
        const monthName = format(date, 'MMMM', { locale: ptBR });
        
        const monthTransactions = transactions.filter(t => t.billingDate.startsWith(key));
        
        // 1. Receita Bruta (Income + Payroll Deduction)
        const income = monthTransactions
            .filter(t => t.type === 'income')
            .reduce((acc, t) => normalizeCurrency(acc + t.amount), 0);
        
        const payrollDeductions = monthTransactions
            .filter(t => t.type === 'payroll_deduction')
            .reduce((acc, t) => normalizeCurrency(acc + t.amount), 0);

        const grossIncome = normalizeCurrency(income + payrollDeductions);

        // 2. Cálculo do Compromissado (Max entre Meta e Gasto Real por categoria)
        const expensesMap = monthTransactions
            .filter(t => t.type === 'expense' || t.type === 'payroll_deduction')
            .reduce((acc, t) => {
                acc[t.category] = normalizeCurrency((acc[t.category] || 0) + t.amount);
                return acc;
            }, {} as Record<string, number>);

        let committedExpense = 0;
        const processedCategories = new Set<string>();

        categories.forEach(cat => {
            const specificMB = monthlyBudgets.find(mb => mb.category_id === cat.id && mb.month_year === key);
            const budget = normalizeCurrency(specificMB ? specificMB.amount : (cat.budget || 0));
            const actual = normalizeCurrency(expensesMap[cat.name] || 0);
            
            committedExpense = normalizeCurrency(committedExpense + Math.max(budget, actual));
            processedCategories.add(cat.name);
        });

        Object.keys(expensesMap).forEach(catName => {
            if (!processedCategories.has(catName)) {
                committedExpense = normalizeCurrency(committedExpense + expensesMap[catName]);
            }
        });

        months.push({
            name: monthName,
            grossIncome,
            committedExpense: normalizeCurrency(committedExpense),
            balance: normalizeCurrency(grossIncome - committedExpense)
        });
    }
    return months;
  }, [transactions, currentYear, categories, monthlyBudgets]);

  const totalAnnualIncome = normalizeCurrency(annualData.reduce((acc, m) => acc + m.grossIncome, 0));
  const totalAnnualCommitted = normalizeCurrency(annualData.reduce((acc, m) => acc + m.committedExpense, 0));
  const totalAnnualBalance = normalizeCurrency(annualData.reduce((acc, m) => acc + m.balance, 0));

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-gray-500 font-medium text-xs uppercase tracking-wider mb-1">Receita Bruta Anual</h3>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalAnnualIncome)}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-full text-green-600">
                    <ArrowUpCircle size={32} />
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-gray-500 font-medium text-xs uppercase tracking-wider mb-1">Comprometido Anual</h3>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalAnnualCommitted)}</p>
                </div>
                <div className="bg-red-50 p-3 rounded-full text-red-600">
                    <ArrowDownCircle size={32} />
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-gray-500 font-medium text-xs uppercase tracking-wider mb-1">Saldo Livre Acumulado</h3>
                    <p className={`text-2xl font-bold ${totalAnnualBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalAnnualBalance)}
                    </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-full text-blue-600">
                    <Wallet size={32} />
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800 uppercase">Detalhamento por Mês - {format(currentYear, 'yyyy')}</h2>
                <div className="flex gap-2 items-center">
                    <button onClick={onExportExcel} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-green-700 bg-white hover:bg-green-50 rounded border border-green-200 transition-colors uppercase">
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button onClick={onExportPDF} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-700 bg-white hover:bg-red-50 rounded border border-red-200 transition-colors uppercase">
                        <FileText size={16} /> PDF
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-100 text-gray-600 text-[10px] border-b uppercase font-bold tracking-wider">
                            <th className="p-4">Mês</th>
                            <th className="p-4 text-right">Receita Bruta</th>
                            <th className="p-4 text-right">Total Comprometido</th>
                            <th className="p-4 text-right">Saldo Livre</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {annualData.map((data, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4 font-bold uppercase text-xs text-gray-800">{data.name}</td>
                                <td className="p-4 text-right text-green-600 font-bold text-sm">{formatCurrency(data.grossIncome)}</td>
                                <td className="p-4 text-right text-red-600 font-bold text-sm">{formatCurrency(data.committedExpense)}</td>
                                <td className={`p-4 text-right font-black text-sm ${data.balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                    {formatCurrency(data.balance)}
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                            <td className="p-4 font-black uppercase text-xs text-gray-900">TOTAIS DO ANO</td>
                            <td className="p-4 text-right text-green-700 font-black text-base">{formatCurrency(totalAnnualIncome)}</td>
                            <td className="p-4 text-right text-red-700 font-black text-base">{formatCurrency(totalAnnualCommitted)}</td>
                            <td className={`p-4 text-right font-black text-lg ${totalAnnualBalance >= 0 ? 'text-blue-800' : 'text-red-700'}`}>
                                {formatCurrency(totalAnnualBalance)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default AnnualComparison;
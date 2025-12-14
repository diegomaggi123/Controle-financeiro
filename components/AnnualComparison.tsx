import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { formatCurrency, getMonthYearKey } from '../utils';
import { format, startOfYear, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileSpreadsheet, FileText } from 'lucide-react';

interface AnnualComparisonProps {
  transactions: Transaction[];
  currentYear: Date;
  onExportExcel: () => void;
  onExportPDF: () => void;
}

const AnnualComparison: React.FC<AnnualComparisonProps> = ({ transactions, currentYear, onExportExcel, onExportPDF }) => {
  const annualData = useMemo(() => {
    const start = startOfYear(currentYear);
    const months = [];

    for (let i = 0; i < 12; i++) {
        const date = addMonths(start, i);
        const key = getMonthYearKey(date);
        const monthName = format(date, 'MMMM', { locale: ptBR });
        
        const monthTransactions = transactions.filter(t => t.billingDate.startsWith(key));
        
        const income = monthTransactions
            .filter(t => t.type === 'income')
            .reduce((acc, t) => acc + t.amount, 0);
            
        const expense = monthTransactions
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => acc + t.amount, 0);

        months.push({
            name: monthName,
            income,
            expense,
            balance: income - expense
        });
    }
    return months;
  }, [transactions, currentYear]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800 capitalize">Resumo Anual - {format(currentYear, 'yyyy')}</h2>
            <div className="flex gap-2 items-center">
                <button 
                    onClick={onExportExcel}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors uppercase"
                    title="Exportar Ano para Excel"
                >
                    <FileSpreadsheet size={16} /> Excel
                </button>
                <button 
                    onClick={onExportPDF}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors uppercase"
                    title="Exportar Ano para PDF"
                >
                    <FileText size={16} /> PDF
                </button>
            </div>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-100 text-gray-600 text-sm border-b">
                        <th className="p-4 font-medium">Mês</th>
                        <th className="p-4 font-medium text-right text-green-700">Receitas</th>
                        <th className="p-4 font-medium text-right text-red-700">Despesas</th>
                        <th className="p-4 font-medium text-right text-blue-700">Saldo</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {annualData.map((data, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-4 font-medium capitalize text-gray-800">{data.name}</td>
                            <td className="p-4 text-right text-green-600 font-medium">{formatCurrency(data.income)}</td>
                            <td className="p-4 text-right text-red-600 font-medium">{formatCurrency(data.expense)}</td>
                            <td className={`p-4 text-right font-bold ${data.balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                {formatCurrency(data.balance)}
                            </td>
                        </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                         <td className="p-4 text-gray-900">TOTAL</td>
                         <td className="p-4 text-right text-green-700">
                            {formatCurrency(annualData.reduce((acc, m) => acc + m.income, 0))}
                         </td>
                         <td className="p-4 text-right text-red-700">
                            {formatCurrency(annualData.reduce((acc, m) => acc + m.expense, 0))}
                         </td>
                         <td className="p-4 text-right text-blue-800">
                            {formatCurrency(annualData.reduce((acc, m) => acc + m.balance, 0))}
                         </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default AnnualComparison;
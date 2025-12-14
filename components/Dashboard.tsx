import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { formatCurrency } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  transactions: Transaction[];
  currentMonthName: string;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#06b6d4', '#84cc16', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ transactions }) => {
  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const total = (Object.values(grouped) as number[]).reduce((a, b) => a + b, 0);

    return Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%'
      }))
      .sort((a, b) => b.value - a.value); // Ordem decrescente (Maior para menor)
  }, [transactions]);

  const establishmentData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    
    // 1. Agrupar valores
    const grouped = expenses.reduce((acc, t) => {
      acc[t.description] = (acc[t.description] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    // Total Geral para cálculo de porcentagem
    const total = (Object.values(grouped) as number[]).reduce((a, b) => a + b, 0);

    // 2. Criar array inicial ordenado
    let sortedData = Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: '' // Será calculado no final
      }))
      .sort((a, b) => b.value - a.value);

    // 3. Limitar a 10 itens e agrupar o restante
    if (sortedData.length > 10) {
      const top10 = sortedData.slice(0, 10);
      const others = sortedData.slice(10);
      const othersTotal = others.reduce((acc, item) => acc + item.value, 0);

      top10.push({
        name: 'Outros estabelecimentos',
        value: othersTotal,
        percentage: ''
      });

      sortedData = top10;
    }

    // 4. Calcular porcentagens finais baseadas no total geral
    return sortedData.map(item => ({
      ...item,
      percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) + '%' : '0%'
    }));
  }, [transactions]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 shadow rounded border text-sm z-50">
          <p className="font-bold">{data.name}</p>
          <p className="text-gray-600">{formatCurrency(data.value)}</p>
          <p className="text-blue-500 font-semibold">{data.percentage}</p>
        </div>
      );
    }
    return null;
  };

  const renderLegend = (value: string, entry: any) => {
      const { payload } = entry;
      return (
          <span className="text-xs text-gray-600 ml-1">
              <span className="font-medium text-gray-800">{value}</span>: {formatCurrency(payload.value)} ({payload.percentage})
          </span>
      );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Despesas por Categoria</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                    layout="vertical" 
                    align="right" 
                    verticalAlign="middle" 
                    formatter={renderLegend}
                    wrapperStyle={{ lineHeight: '24px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
             <div className="h-full flex items-center justify-center text-gray-400">Sem dados neste mês</div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Despesas por Estabelecimento</h3>
           {establishmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={establishmentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {establishmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                    layout="vertical" 
                    align="right" 
                    verticalAlign="middle" 
                    formatter={renderLegend}
                    wrapperStyle={{ lineHeight: '24px' }}
                />
              </PieChart>
            </ResponsiveContainer>
           ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sem dados neste mês</div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
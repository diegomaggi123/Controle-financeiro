import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { formatCurrency, normalizeCurrency } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  transactions: Transaction[];
  currentMonthName: string;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#06b6d4', '#84cc16', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ transactions }) => {
  
  // 1. Calcular a Renda Total do Mês (Base para a porcentagem)
  // Usamos normalizeCurrency para garantir que 0.1 + 0.2 não vire 0.300000004
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
    // Se houver receita, calcula sobre a receita (Pedido do usuário: % da Renda)
    if (totalIncome > 0) {
      const pct = (value / totalIncome) * 100;
      return pct.toFixed(1) + '% da Renda';
    } 
    // Se não houver receita (0), calcula sobre o total de gastos para não mostrar "Infinity"
    else if (totalExpenses > 0) {
      const pct = (value / totalExpenses) * 100;
      return pct.toFixed(1) + '% dos Gastos';
    }
    return '0%';
  };

  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    
    // Agrupa somando os valores
    const grouped = expenses.reduce((acc, t) => {
      // Normaliza a soma a cada passo para evitar erros de ponto flutuante acumulados
      acc[t.category] = normalizeCurrency((acc[t.category] || 0) + t.amount);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: calculatePercentage(value)
      }))
      .sort((a, b) => b.value - a.value); // Ordem decrescente
  }, [transactions, totalIncome, totalExpenses]);

  const establishmentData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    
    // 1. Agrupar valores
    const grouped = expenses.reduce((acc, t) => {
      acc[t.description] = normalizeCurrency((acc[t.description] || 0) + t.amount);
      return acc;
    }, {} as Record<string, number>);

    // 2. Criar array inicial ordenado
    let sortedData = Object.entries(grouped)
      .map(([name, value]: [string, number]) => ({
        name,
        value,
        percentage: '' // Será preenchido depois
      }))
      .sort((a, b) => b.value - a.value);

    // 3. Limitar a 10 itens e agrupar o restante
    if (sortedData.length > 10) {
      const top10 = sortedData.slice(0, 10);
      const others = sortedData.slice(10);
      // Normaliza a soma do grupo "Outros"
      const othersTotal = normalizeCurrency(others.reduce((acc, item) => acc + item.value, 0));

      top10.push({
        name: 'OUTROS LOCAIS',
        value: othersTotal,
        percentage: ''
      });

      sortedData = top10;
    }

    // 4. Calcular porcentagens finais usando a lógica baseada na Renda
    return sortedData.map(item => ({
      ...item,
      percentage: calculatePercentage(item.value)
    }));
  }, [transactions, totalIncome, totalExpenses]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-100 text-sm z-50">
          <p className="font-bold text-gray-800 uppercase mb-1">{data.name}</p>
          <div className="flex flex-col gap-1">
            <span className="text-gray-600 font-medium">
                Valor: {formatCurrency(data.value)}
            </span>
            <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded w-fit text-xs border border-blue-100">
                {data.percentage}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderLegend = (value: string, entry: any) => {
      const { payload } = entry;
      return (
          <span className="text-xs text-gray-600 ml-1">
              <span className="font-medium text-gray-800 uppercase">{value}</span>: {formatCurrency(payload.value)} 
              <span className="text-gray-400 ml-1 text-[10px]">({payload.percentage})</span>
          </span>
      );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-800 uppercase">Despesas por Categoria</h3>
            <p className="text-xs text-gray-500 uppercase mt-1">Percentual baseado na <strong className="text-blue-600">Renda Mensal</strong></p>
          </div>
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
             <div className="h-full flex items-center justify-center text-gray-400 uppercase text-sm">Sem despesas neste mês</div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-800 uppercase">Despesas por Local</h3>
            <p className="text-xs text-gray-500 uppercase mt-1">Percentual baseado na <strong className="text-blue-600">Renda Mensal</strong></p>
          </div>
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
            <div className="h-full flex items-center justify-center text-gray-400 uppercase text-sm">Sem despesas neste mês</div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
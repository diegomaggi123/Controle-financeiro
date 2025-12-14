import React, { useMemo, useState } from 'react';
import { Transaction, CategoryData } from '../types';
import { formatCurrency, getCategoryColor } from '../utils';
import { AlertCircle, CheckCircle, Edit2, Save, X } from 'lucide-react';

interface BudgetProgressProps {
  transactions: Transaction[];
  categories: CategoryData[];
  onUpdateCategory: (id: string, name: string, budget: number, scope: 'single' | 'future') => void;
  currentMonthName: string;
}

const BudgetProgress: React.FC<BudgetProgressProps> = ({ transactions, categories, onUpdateCategory, currentMonthName }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // State for Scope Modal
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{id: string, name: string, budget: number} | null>(null);

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

  const handleStartEdit = (cat: CategoryData) => {
      setEditingId(cat.id);
      setEditValue(cat.budget ? cat.budget.toString() : '');
  };

  const handleSave = (cat: CategoryData) => {
      const newVal = parseFloat(editValue.replace(',', '.'));
      if (isNaN(newVal) || newVal < 0) return;

      if (newVal !== cat.budget) {
          setPendingUpdate({ id: cat.id, name: cat.name, budget: newVal });
          setShowScopeModal(true);
      } else {
          setEditingId(null);
      }
  };

  const confirmScope = (scope: 'single' | 'future') => {
      if (pendingUpdate) {
          onUpdateCategory(pendingUpdate.id, pendingUpdate.name, pendingUpdate.budget, scope);
      }
      setShowScopeModal(false);
      setPendingUpdate(null);
      setEditingId(null);
  };

  const cancelEdit = () => {
      setEditingId(null);
      setEditValue('');
  };

  if (budgetData.length === 0) return null;

  return (
    <>
    {/* Inline Scope Confirmation Modal */}
    {showScopeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in duration-200">
                <h3 className="text-lg font-bold mb-4 text-gray-800 uppercase">Alteração de Meta</h3>
                <p className="mb-6 text-gray-600">
                    Você alterou o orçamento. Como deseja aplicar?
                </p>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => confirmScope('single')}
                        className="p-3 bg-blue-100 text-blue-800 hover:bg-blue-200 rounded text-left font-bold uppercase border border-blue-200"
                    >
                        Apenas em {currentMonthName}
                    </button>
                    <button 
                        onClick={() => confirmScope('future')}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-left font-bold uppercase shadow-md"
                    >
                       Definir como Novo Padrão
                    </button>
                    <button 
                        onClick={() => { setShowScopeModal(false); setPendingUpdate(null); }}
                        className="mt-2 text-sm text-gray-500 hover:underline text-center uppercase"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )}

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
              <div className="text-right flex items-center gap-2 justify-end">
                <span className={`text-sm font-bold ${item.isOverBudget ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatCurrency(item.spent)}
                </span>
                <span className="text-xs text-gray-400">/</span>
                
                {editingId === item.id ? (
                    <div className="flex items-center gap-1">
                        <input 
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-20 p-1 text-xs border rounded outline-none focus:border-blue-500"
                            autoFocus
                        />
                        <button onClick={() => handleSave(item)} className="text-green-600 hover:bg-green-50 rounded p-0.5"><Save size={14} /></button>
                        <button onClick={cancelEdit} className="text-gray-500 hover:bg-gray-100 rounded p-0.5"><X size={14} /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 group">
                        <span className="text-xs text-gray-500 font-medium">{formatCurrency(item.budget || 0)}</span>
                        <button 
                            onClick={() => handleStartEdit(item)}
                            className="text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                            title="Editar Meta"
                        >
                            <Edit2 size={12} />
                        </button>
                    </div>
                )}
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
    </>
  );
};

export default BudgetProgress;
import React, { useState } from 'react';
import { CategoryData, EstablishmentData } from '../types';
import { Trash2, Edit2, Plus, X, Save, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils';

interface SettingsProps {
  categories: CategoryData[];
  establishments: EstablishmentData[];
  onUpdateCategory: (id: string, name: string, budget?: number, scope?: 'single' | 'future') => void;
  onDeleteCategory: (id: string) => void;
  onUpdateEstablishment: (id: string, name: string) => void;
  onDeleteEstablishment: (id: string) => void;
  onAddCategory: (name: string, budget?: number) => void;
  onAddEstablishment: (name: string) => void;
  onClose: () => void;
  currentMonthName?: string;
}

const Settings: React.FC<SettingsProps> = ({
  categories,
  establishments,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateEstablishment,
  onDeleteEstablishment,
  onAddCategory,
  onAddEstablishment,
  onClose,
  currentMonthName = 'MÊS ATUAL'
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'establishments'>('categories');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editBudget, setEditBudget] = useState(''); 
  const [originalBudget, setOriginalBudget] = useState<number | undefined>(undefined);
  
  const [newValue, setNewValue] = useState('');
  const [newBudget, setNewBudget] = useState(''); 
  
  // State for Scope Modal
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{id: string, name: string, budget: number} | null>(null);

  const handleStartEdit = (id: string, currentName: string, currentBudget?: number) => {
    setEditingId(id);
    setEditValue(currentName.toUpperCase());
    setEditBudget(currentBudget ? currentBudget.toString() : '');
    setOriginalBudget(currentBudget);
  };

  const handleSaveEdit = (type: 'cat' | 'est') => {
    if (!editingId || !editValue.trim()) return;
    const upperValue = editValue.trim().toUpperCase();
    
    if (type === 'cat') {
        const budgetVal = editBudget ? parseFloat(editBudget.replace(',', '.')) : 0;
        
        // Se o orçamento mudou, pergunta o escopo
        // Nota: Comparação solta (loose) pois budgetVal pode ser NaN ou 0 e originalBudget undefined
        const budgetChanged = (budgetVal !== (originalBudget || 0));

        if (budgetChanged) {
            setPendingUpdate({ id: editingId, name: upperValue, budget: budgetVal });
            setShowScopeModal(true);
        } else {
            // Se só mudou o nome, salva direto (scope default é future/all para nome, mas a função lida)
            onUpdateCategory(editingId, upperValue, budgetVal, 'future');
            finishEdit();
        }
    } else {
        onUpdateEstablishment(editingId, upperValue);
        finishEdit();
    }
  };

  const confirmScope = (scope: 'single' | 'future') => {
      if (pendingUpdate) {
          onUpdateCategory(pendingUpdate.id, pendingUpdate.name, pendingUpdate.budget, scope);
      }
      setShowScopeModal(false);
      setPendingUpdate(null);
      finishEdit();
  };

  const finishEdit = () => {
    setEditingId(null);
    setEditValue('');
    setEditBudget('');
    setOriginalBudget(undefined);
  };

  const handleAdd = (type: 'cat' | 'est') => {
    if (!newValue.trim()) return;
    const upperValue = newValue.trim().toUpperCase();
    
    if (type === 'cat') {
        const budgetVal = newBudget ? parseFloat(newBudget.replace(',', '.')) : 0;
        onAddCategory(upperValue, budgetVal);
    } else {
        onAddEstablishment(upperValue);
    }
    
    setNewValue('');
    setNewBudget('');
  };

  return (
    <div className="fixed inset-0 bg-white md:bg-black md:bg-opacity-50 flex items-center justify-center z-50 md:p-4">
      
      {/* Scope Confirmation Modal */}
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

      <div className="bg-white w-full h-full md:h-[80vh] md:max-w-2xl md:rounded-xl shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="md:hidden p-1 -ml-1 text-gray-600">
                <ArrowLeft size={24} />
            </button>
            <h2 className="text-xl font-bold text-gray-800 uppercase">Configurações</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full hidden md:block">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b shrink-0">
          <button
            className={`flex-1 py-4 md:py-3 text-sm md:text-base font-bold uppercase tracking-wide ${activeTab === 'categories' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('categories')}
          >
            Categorias
          </button>
          <button
            className={`flex-1 py-4 md:py-3 text-sm md:text-base font-bold uppercase tracking-wide ${activeTab === 'establishments' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('establishments')}
          >
            Locais
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
          
          {/* Add New Item */}
          <div className="flex flex-col md:flex-row gap-2 mb-6 items-stretch md:items-center bg-gray-50 p-3 rounded-lg border border-gray-200 sticky top-0 z-10">
            <input 
                type="text" 
                value={newValue} 
                onChange={(e) => setNewValue(e.target.value.toUpperCase())}
                placeholder={activeTab === 'categories' ? "NOVA CATEGORIA..." : "NOVO LOCAL..."}
                className="flex-1 p-3 border rounded-lg uppercase h-12 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
                {activeTab === 'categories' && (
                    <input 
                        type="number" 
                        value={newBudget} 
                        onChange={(e) => setNewBudget(e.target.value)}
                        placeholder="R$ META"
                        className="w-24 md:w-32 p-3 border rounded-lg h-12 outline-none focus:ring-2 focus:ring-blue-500"
                        title="Orçamento mensal previsto"
                    />
                )}
                <button 
                    onClick={() => handleAdd(activeTab === 'categories' ? 'cat' : 'est')}
                    className="bg-green-500 text-white px-6 h-12 rounded-lg hover:bg-green-600 flex items-center justify-center shadow-sm"
                >
                    <Plus size={24} />
                </button>
            </div>
          </div>

          <ul className="space-y-3">
            {(activeTab === 'categories' ? categories : establishments).map((item) => (
              <li key={item.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                {editingId === item.id ? (
                    <div className="flex flex-col md:flex-row gap-2 w-full">
                        <input 
                            type="text" 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                            className="flex-1 p-2 border rounded uppercase"
                            autoFocus
                        />
                        <div className="flex gap-2 items-center justify-end">
                             {activeTab === 'categories' && (
                                <input 
                                    type="number" 
                                    value={editBudget} 
                                    onChange={(e) => setEditBudget(e.target.value)}
                                    placeholder="0.00"
                                    className="w-24 p-2 border rounded"
                                />
                            )}
                            <button onClick={() => handleSaveEdit(activeTab === 'categories' ? 'cat' : 'est')} className="text-white bg-green-500 p-2 rounded"><Save size={20} /></button>
                            <button onClick={() => finishEdit()} className="text-gray-500 bg-gray-200 p-2 rounded"><X size={20} /></button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-800 font-bold uppercase text-sm md:text-base">{item.name}</span>
                            {(item as CategoryData).budget && (item as CategoryData).budget! > 0 && activeTab === 'categories' && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full w-fit font-medium">
                                    Meta: {formatCurrency((item as CategoryData).budget!)}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-4 pl-4">
                            <button 
                                onClick={() => handleStartEdit(item.id, item.name, (item as CategoryData).budget)} 
                                className="text-blue-500 hover:bg-blue-50 p-2 -m-2 rounded-full"
                            >
                                <Edit2 size={20} />
                            </button>
                            <button 
                                onClick={() => activeTab === 'categories' ? onDeleteCategory(item.id) : onDeleteEstablishment(item.id)} 
                                className="text-red-500 hover:bg-red-50 p-2 -m-2 rounded-full"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Settings;
import React, { useState } from 'react';
import { CategoryData, EstablishmentData } from '../types';
import { Trash2, Edit2, Plus, X, Save } from 'lucide-react';
import { formatCurrency } from '../utils';

interface SettingsProps {
  categories: CategoryData[];
  establishments: EstablishmentData[];
  onUpdateCategory: (id: string, name: string, budget?: number) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateEstablishment: (id: string, name: string) => void;
  onDeleteEstablishment: (id: string) => void;
  onAddCategory: (name: string, budget?: number) => void;
  onAddEstablishment: (name: string) => void;
  onClose: () => void;
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
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'establishments'>('categories');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editBudget, setEditBudget] = useState(''); // Estado para o orçamento sendo editado
  
  const [newValue, setNewValue] = useState('');
  const [newBudget, setNewBudget] = useState(''); // Estado para novo orçamento

  const handleStartEdit = (id: string, currentName: string, currentBudget?: number) => {
    setEditingId(id);
    setEditValue(currentName.toUpperCase());
    setEditBudget(currentBudget ? currentBudget.toString() : '');
  };

  const handleSaveEdit = (type: 'cat' | 'est') => {
    if (!editingId || !editValue.trim()) return;
    const upperValue = editValue.trim().toUpperCase();
    
    if (type === 'cat') {
        const budgetVal = editBudget ? parseFloat(editBudget.replace(',', '.')) : 0;
        onUpdateCategory(editingId, upperValue, budgetVal);
    } else {
        onUpdateEstablishment(editingId, upperValue);
    }
    
    setEditingId(null);
    setEditValue('');
    setEditBudget('');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800 uppercase">Gerenciar Listas</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b">
          <button
            className={`flex-1 py-3 font-medium uppercase ${activeTab === 'categories' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('categories')}
          >
            Categorias e Orçamentos
          </button>
          <button
            className={`flex-1 py-3 font-medium uppercase ${activeTab === 'establishments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('establishments')}
          >
            Descrições / Locais
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-2 mb-4 items-center">
            <input 
                type="text" 
                value={newValue} 
                onChange={(e) => setNewValue(e.target.value.toUpperCase())}
                placeholder={activeTab === 'categories' ? "NOVA CATEGORIA..." : "NOVO LOCAL..."}
                className="flex-1 p-2 border rounded-lg uppercase h-10"
            />
            {activeTab === 'categories' && (
                <input 
                    type="number" 
                    value={newBudget} 
                    onChange={(e) => setNewBudget(e.target.value)}
                    placeholder="R$ META"
                    className="w-24 p-2 border rounded-lg h-10"
                    title="Orçamento mensal previsto"
                />
            )}
            <button 
                onClick={() => handleAdd(activeTab === 'categories' ? 'cat' : 'est')}
                className="bg-green-500 text-white px-4 h-10 rounded-lg hover:bg-green-600 flex items-center justify-center"
            >
                <Plus />
            </button>
          </div>

          <ul className="space-y-2">
            {(activeTab === 'categories' ? categories : establishments).map((item) => (
              <li key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                {editingId === item.id ? (
                    <div className="flex gap-2 w-full items-center">
                        <input 
                            type="text" 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                            className="flex-1 p-1 border rounded uppercase"
                        />
                        {activeTab === 'categories' && (
                            <input 
                                type="number" 
                                value={editBudget} 
                                onChange={(e) => setEditBudget(e.target.value)}
                                placeholder="0.00"
                                className="w-24 p-1 border rounded"
                            />
                        )}
                        <button onClick={() => handleSaveEdit(activeTab === 'categories' ? 'cat' : 'est')} className="text-green-600"><Save size={20} /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-500"><X size={20} /></button>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                            <span className="text-gray-800 font-medium uppercase">{item.name}</span>
                            {(item as CategoryData).budget && (item as CategoryData).budget! > 0 && activeTab === 'categories' && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                    Meta: {formatCurrency((item as CategoryData).budget!)}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleStartEdit(item.id, item.name, (item as CategoryData).budget)} 
                                className="text-blue-500 hover:bg-blue-100 p-1 rounded"
                            >
                                <Edit2 size={18} />
                            </button>
                            <button 
                                onClick={() => activeTab === 'categories' ? onDeleteCategory(item.id) : onDeleteEstablishment(item.id)} 
                                className="text-red-500 hover:bg-red-100 p-1 rounded"
                            >
                                <Trash2 size={18} />
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
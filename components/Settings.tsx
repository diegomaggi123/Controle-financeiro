import React, { useState } from 'react';
import { CategoryData, EstablishmentData } from '../types';
import { Trash2, Edit2, Plus, X, Save } from 'lucide-react';

interface SettingsProps {
  categories: CategoryData[];
  establishments: EstablishmentData[];
  onUpdateCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateEstablishment: (id: string, name: string) => void;
  onDeleteEstablishment: (id: string) => void;
  onAddCategory: (name: string) => void;
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
  const [newValue, setNewValue] = useState('');

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const handleSaveEdit = (type: 'cat' | 'est') => {
    if (!editingId || !editValue.trim()) return;
    if (type === 'cat') onUpdateCategory(editingId, editValue.trim());
    else onUpdateEstablishment(editingId, editValue.trim());
    setEditingId(null);
    setEditValue('');
  };

  const handleAdd = (type: 'cat' | 'est') => {
    if (!newValue.trim()) return;
    if (type === 'cat') onAddCategory(newValue.trim());
    else onAddEstablishment(newValue.trim());
    setNewValue('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Gerenciar Listas</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b">
          <button
            className={`flex-1 py-3 font-medium ${activeTab === 'categories' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('categories')}
          >
            Categorias
          </button>
          <button
            className={`flex-1 py-3 font-medium ${activeTab === 'establishments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('establishments')}
          >
            Descrições / Locais
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-2 mb-4">
            <input 
                type="text" 
                value={newValue} 
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={activeTab === 'categories' ? "Nova Categoria..." : "Novo Local..."}
                className="flex-1 p-2 border rounded-lg"
            />
            <button 
                onClick={() => handleAdd(activeTab === 'categories' ? 'cat' : 'est')}
                className="bg-green-500 text-white px-4 rounded-lg hover:bg-green-600"
            >
                <Plus />
            </button>
          </div>

          <ul className="space-y-2">
            {(activeTab === 'categories' ? categories : establishments).map((item) => (
              <li key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                {editingId === item.id ? (
                    <div className="flex gap-2 w-full">
                        <input 
                            type="text" 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 p-1 border rounded"
                        />
                        <button onClick={() => handleSaveEdit(activeTab === 'categories' ? 'cat' : 'est')} className="text-green-600"><Save size={20} /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-500"><X size={20} /></button>
                    </div>
                ) : (
                    <>
                        <span className="text-gray-800 font-medium">{item.name}</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleStartEdit(item.id, item.name)} className="text-blue-500 hover:bg-blue-100 p-1 rounded"><Edit2 size={18} /></button>
                            <button onClick={() => activeTab === 'categories' ? onDeleteCategory(item.id) : onDeleteEstablishment(item.id)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={18} /></button>
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

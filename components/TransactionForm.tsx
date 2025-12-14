import React, { useState, useEffect } from 'react';
import { Transaction, RecurrenceType, TransactionType, CategoryData, EstablishmentData } from '../types';
import { generateId, addMonthsToDate, formatDateForInput, formatCurrency } from '../utils';
import { X, Plus, Trash2 } from 'lucide-react';
import { addMonths, parseISO } from 'date-fns';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transactions: Transaction[], mode: 'create' | 'update', originalTransaction?: Transaction, updateScope?: 'single' | 'future') => void;
  initialData?: Transaction | null;
  categories: CategoryData[];
  establishments: EstablishmentData[];
  onAddCategory: (name: string) => void;
  onAddEstablishment: (name: string) => void;
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  categories,
  establishments,
  onAddCategory,
  onAddEstablishment
}) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('single');
  const [installments, setInstallments] = useState('2'); // Usado tanto para parcelas quanto para meses de repetição
  const [startNextMonth, setStartNextMonth] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [updateScope, setUpdateScope] = useState<'single' | 'future'>('single');
  const [showUpdateScopeModal, setShowUpdateScopeModal] = useState(false);

  useEffect(() => {
    if (initialData) {
      setDescription(initialData.description);
      setAmount(initialData.amount.toString());
      setType(initialData.type);
      setCategory(initialData.category);
      setDate(formatDateForInput(initialData.date)); // Use purchase date
      setRecurrenceType(initialData.recurrenceType);
      
      if (initialData.recurrenceType === 'installment' || initialData.recurrenceType === 'repeat') {
        setInstallments(initialData.installmentTotal?.toString() || '2');
      }

      const pDate = parseISO(initialData.date);
      const bDate = parseISO(initialData.billingDate);
      const isNextMonth = bDate.getMonth() !== pDate.getMonth() || bDate.getFullYear() !== pDate.getFullYear();
      setStartNextMonth(isNextMonth);

    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setType('expense');
    setCategory(categories.length > 0 ? categories[0].name : '');
    setDate(new Date().toISOString().split('T')[0]);
    setRecurrenceType('single');
    setInstallments('2');
    setStartNextMonth(false);
    setNewCategoryName('');
    setShowAddCategory(false);
    setUpdateScope('single');
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      onAddCategory(newCategoryName.trim());
      setCategory(newCategoryName.trim());
      setNewCategoryName('');
      setShowAddCategory(false);
    }
  };

  const handleSubmit = () => {
    if (!description || !amount || !category || !date) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    if (initialData && (initialData.recurrenceType !== 'single' || recurrenceType !== 'single')) {
        setShowUpdateScopeModal(true);
    } else {
        processSave('single');
    }
  };

  const processSave = (scope: 'single' | 'future') => {
    const transactionsToSave: Transaction[] = [];
    const baseGroupId = initialData ? initialData.groupId : generateId();
    const purchaseDate = parseISO(date);
    const startBillingDate = startNextMonth ? addMonths(purchaseDate, 1) : purchaseDate;
    
    const parsedAmount = parseFloat(amount.replace(',', '.'));

    if (recurrenceType === 'single') {
        transactionsToSave.push({
            id: initialData && scope === 'single' ? initialData.id : generateId(),
            groupId: baseGroupId,
            description,
            amount: parsedAmount,
            type,
            category,
            date: date, 
            billingDate: startBillingDate.toISOString(),
            recurrenceType: 'single'
        });
    } else if (recurrenceType === 'fixed') {
        const count = scope === 'single' ? 1 : 24; 
        
        for (let i = 0; i < count; i++) {
            const billDate = addMonths(startBillingDate, i);
            const id = (initialData && scope === 'single' && i === 0) ? initialData.id : generateId();

            transactionsToSave.push({
                id,
                groupId: baseGroupId,
                description,
                amount: parsedAmount,
                type,
                category,
                date: date,
                billingDate: billDate.toISOString(),
                recurrenceType: 'fixed'
            });
        }
    } else if (recurrenceType === 'installment') {
        const totalInstallments = parseInt(installments);
        const installmentValue = parsedAmount / totalInstallments;
        const loopCount = scope === 'single' ? 1 : totalInstallments;

        for (let i = 0; i < loopCount; i++) {
             const currentInstallmentNumber = scope === 'single' && initialData ? initialData.installmentCurrent : (i + 1);
             const billDate = addMonths(startBillingDate, i);
             const id = (initialData && scope === 'single' && i === 0) ? initialData.id : generateId();

             transactionsToSave.push({
                 id,
                 groupId: baseGroupId,
                 description,
                 amount: installmentValue,
                 type,
                 category,
                 date: date,
                 billingDate: billDate.toISOString(),
                 recurrenceType: 'installment',
                 installmentCurrent: currentInstallmentNumber,
                 installmentTotal: totalInstallments
             });
        }
    } else if (recurrenceType === 'repeat') {
        // Nova lógica: Valor Mensal se repete X vezes
        const totalRepeats = parseInt(installments);
        // Aqui o valor NÃO é dividido. O parsedAmount é o valor mensal.
        const loopCount = scope === 'single' ? 1 : totalRepeats;

        for (let i = 0; i < loopCount; i++) {
            const currentNumber = scope === 'single' && initialData ? initialData.installmentCurrent : (i + 1);
            const billDate = addMonths(startBillingDate, i);
            const id = (initialData && scope === 'single' && i === 0) ? initialData.id : generateId();

            transactionsToSave.push({
                id,
                groupId: baseGroupId,
                description,
                amount: parsedAmount, 
                type,
                category,
                date: date,
                billingDate: billDate.toISOString(),
                recurrenceType: 'repeat',
                installmentCurrent: currentNumber,
                installmentTotal: totalRepeats
            });
       }
    }

    onSave(transactionsToSave, initialData ? 'update' : 'create', initialData || undefined, scope);
    setShowUpdateScopeModal(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {showUpdateScopeModal ? (
         <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
             <h3 className="text-lg font-bold mb-4 text-gray-800">Aplicar alterações</h3>
             <p className="mb-6 text-gray-600">Você está alterando uma transação recorrente. Como deseja aplicar?</p>
             <div className="flex flex-col gap-3">
                 <button 
                    onClick={() => processSave('single')}
                    className="p-3 bg-gray-100 hover:bg-gray-200 rounded text-left font-medium"
                 >
                     Apenas nesta transação
                 </button>
                 <button 
                    onClick={() => processSave('future')}
                    className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-left font-medium"
                 >
                     Nesta e nas futuras
                 </button>
                 <button 
                    onClick={() => setShowUpdateScopeModal(false)}
                    className="mt-2 text-sm text-gray-500 hover:underline text-center"
                 >
                     Cancelar
                 </button>
             </div>
         </div>
      ) : (
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-800">
            {initialData ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          
          {/* Type Selection */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                type === 'expense' ? 'bg-red-500 text-white shadow' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              Despesa
            </button>
            <button
              onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                type === 'income' ? 'bg-green-500 text-white shadow' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              Receita
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {recurrenceType === 'installment' ? 'Valor Total da Compra' : 'Valor do Lançamento'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">R$</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Description (Establishment) - Free Text + Datalist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Estabelecimento</label>
            <input
                list="establishments-list"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Digite ou selecione..."
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <datalist id="establishments-list">
                {establishments.map(est => (
                    <option key={est.id} value={est.name} />
                ))}
            </datalist>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            {!showAddCategory ? (
                <div className="flex gap-2">
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        <option value="">Selecione...</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={() => setShowAddCategory(true)}
                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                        title="Nova Categoria"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Nome da categoria"
                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        autoFocus
                    />
                    <button onClick={handleAddCategory} className="px-3 bg-green-500 text-white rounded-lg">OK</button>
                    <button onClick={() => setShowAddCategory(false)} className="px-3 bg-gray-300 text-gray-700 rounded-lg">X</button>
                </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repetição</label>
            <select
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="single">À Vista (Único)</option>
              <option value="installment">Parcelado (Valor Total / Vezes)</option>
              <option value="repeat">Repetir (Valor Mensal x Vezes)</option>
              <option value="fixed">Fixo (Mensal Indefinido)</option>
            </select>
          </div>

          {/* Installments/Repeat specific input */}
          {(recurrenceType === 'installment' || recurrenceType === 'repeat') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                  {recurrenceType === 'installment' ? 'Quantidade de Parcelas' : 'Quantidade de Meses'}
              </label>
              <input
                type="number"
                min="2"
                max="99"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                 {recurrenceType === 'installment' && amount && installments ? (
                     `Valor da parcela: ${formatCurrency(parseFloat(amount) / parseInt(installments))}`
                 ) : recurrenceType === 'repeat' && amount && installments ? (
                     `Valor total do período: ${formatCurrency(parseFloat(amount) * parseInt(installments))}`
                 ) : ''}
              </p>
            </div>
          )}

          {/* Start Next Month Checkbox */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="startNextMonth"
              checked={startNextMonth}
              onChange={(e) => setStartNextMonth(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="startNextMonth" className="text-sm text-gray-700 select-none">
              {(recurrenceType === 'installment' || recurrenceType === 'repeat')
                ? 'Primeira cobrança somente no mês seguinte'
                : 'Cobrança somente no mês seguinte'}
            </label>
          </div>

        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900 font-medium shadow-sm"
          >
            Salvar
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

export default TransactionForm;
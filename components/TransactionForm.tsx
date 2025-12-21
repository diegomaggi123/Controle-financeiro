import React, { useState, useEffect } from 'react';
import { Transaction, RecurrenceType, TransactionType, CategoryData, EstablishmentData } from '../types';
import { generateId, addMonthsToDate, formatDateForInput, formatCurrency, normalizeCurrency } from '../utils';
import { X, Plus, Trash2, ArrowLeft, Info } from 'lucide-react';
import { addMonths, addWeeks, parseISO } from 'date-fns';

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
  const [amountDisplay, setAmountDisplay] = useState('0,00');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('single');
  const [frequency, setFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const [installments, setInstallments] = useState('2'); 
  const [startNextMonth, setStartNextMonth] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showUpdateScopeModal, setShowUpdateScopeModal] = useState(false);

  useEffect(() => {
    if (initialData) {
      setDescription(initialData.description.toUpperCase());
      const rawValue = (initialData.amount * 100).toFixed(0);
      handleAmountChange(rawValue);
      
      setType(initialData.type);
      setCategory(initialData.category); 
      setDate(formatDateForInput(initialData.date)); 
      setRecurrenceType(initialData.recurrenceType);
      setFrequency('monthly'); 
      
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
    setAmountDisplay('0,00');
    setType('expense');
    setCategory(categories.length > 0 ? categories[0].name : '');
    setDate(new Date().toISOString().split('T')[0]);
    setRecurrenceType('single');
    setFrequency('monthly');
    setInstallments('2');
    setStartNextMonth(false);
    setNewCategoryName('');
    setShowAddCategory(false);
  };

  const handleAmountChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, '');
    if (!cleanValue || cleanValue === '000') {
      setAmountDisplay('0,00');
      return;
    }
    const intValue = parseInt(cleanValue, 10);
    const decimalValue = intValue / 100;
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(decimalValue);
    setAmountDisplay(formatted);
  };

  const getNumericAmount = () => {
    const cleanValue = amountDisplay.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue);
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const upperName = newCategoryName.trim().toUpperCase();
      onAddCategory(upperName);
      setCategory(upperName);
      setNewCategoryName('');
      setShowAddCategory(false);
    }
  };

  const handleSubmit = () => {
    if (!description || getNumericAmount() <= 0 || !category || !date) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    if (initialData) {
        // Se for Desconto em Folha OU se tiver recorrência, pergunta o escopo
        if (initialData.type === 'payroll_deduction' || type === 'payroll_deduction' || initialData.recurrenceType !== 'single' || recurrenceType !== 'single') {
            setShowUpdateScopeModal(true);
        } else {
            processSave('single');
        }
    } else {
        processSave('future');
    }
  };

  const processSave = (scope: 'single' | 'future') => {
    const transactionsToSave: Transaction[] = [];
    const baseGroupId = initialData ? initialData.groupId : generateId();
    const purchaseDate = parseISO(date);
    const startBillingDate = startNextMonth ? addMonths(purchaseDate, 1) : purchaseDate;
    
    const parsedAmount = normalizeCurrency(getNumericAmount());
    const upperDescription = description.toUpperCase();

    const getNextDate = (startDate: Date, index: number, freq: string) => {
        if (freq === 'weekly') return addWeeks(startDate, index);
        if (freq === 'biweekly') return addWeeks(startDate, index * 2);
        return addMonths(startDate, index);
    };

    if (recurrenceType === 'single') {
        transactionsToSave.push({
            id: initialData && scope === 'single' ? initialData.id : generateId(),
            groupId: baseGroupId,
            description: upperDescription,
            amount: parsedAmount,
            type,
            category,
            date: date, 
            billingDate: startBillingDate.toISOString(),
            recurrenceType: 'single'
        });
    } else if (recurrenceType === 'fixed' || recurrenceType === 'repeat' || recurrenceType === 'installment') {
        const totalItems = recurrenceType === 'installment' || recurrenceType === 'repeat' ? parseInt(installments) : (scope === 'single' ? 1 : 24);
        const loopCount = scope === 'single' ? 1 : totalItems;

        for (let i = 0; i < loopCount; i++) {
             const currentNum = scope === 'single' && initialData ? (initialData.installmentCurrent || 1) : (i + 1);
             const billDate = getNextDate(startBillingDate, i, frequency);
             const curDate = getNextDate(purchaseDate, i, frequency);
             const id = (initialData && scope === 'single' && i === 0) ? initialData.id : generateId();

             let finalAmount = parsedAmount;
             if (recurrenceType === 'installment') {
                 const baseVal = Math.floor((parsedAmount / totalItems) * 100) / 100;
                 const remainder = normalizeCurrency(parsedAmount - (baseVal * totalItems));
                 finalAmount = currentNum === 1 ? normalizeCurrency(baseVal + remainder) : baseVal;
             }

             transactionsToSave.push({
                 id,
                 groupId: baseGroupId,
                 description: upperDescription,
                 amount: finalAmount,
                 type,
                 category,
                 date: curDate.toISOString(), 
                 billingDate: billDate.toISOString(),
                 recurrenceType: recurrenceType,
                 installmentCurrent: (recurrenceType !== 'fixed') ? currentNum : undefined,
                 installmentTotal: (recurrenceType !== 'fixed') ? totalItems : undefined
             });
        }
    }

    onSave(transactionsToSave, initialData ? 'update' : 'create', initialData || undefined, scope);
    setShowUpdateScopeModal(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white md:bg-black md:bg-opacity-50 flex items-end md:items-center justify-center z-50 md:p-4">
      {showUpdateScopeModal ? (
         <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
             <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
                 <h3 className="text-lg font-bold mb-4 text-gray-800 uppercase">Aplicar alterações</h3>
                 <p className="mb-6 text-gray-600 text-sm">Como deseja aplicar as mudanças neste {(type === 'payroll_deduction' || initialData?.type === 'payroll_deduction') ? 'Desconto em Folha' : 'Lançamento'}?</p>
                 <div className="flex flex-col gap-3">
                     <button onClick={() => processSave('single')} className="p-3 bg-gray-100 hover:bg-gray-200 rounded text-left font-bold uppercase text-xs text-gray-700">Apenas neste mês</button>
                     <button onClick={() => processSave('future')} className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-left font-bold uppercase text-xs shadow-md">Neste e nos futuros</button>
                     <button onClick={() => setShowUpdateScopeModal(false)} className="mt-2 text-sm text-gray-500 hover:underline text-center uppercase font-bold">Cancelar</button>
                 </div>
             </div>
         </div>
      ) : (
      <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-md md:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b bg-white shrink-0">
          <div className="flex items-center gap-2">
             <button onClick={onClose} className="md:hidden p-1 -ml-1 text-gray-600"><ArrowLeft size={24} /></button>
             <h2 className="text-xl font-bold text-gray-800 uppercase">{initialData ? 'Editar' : 'Novo Lançamento'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full hidden md:block"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-24">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Tipo</label>
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button onClick={() => setType('expense')} className={`flex-1 py-3 rounded-md font-bold transition-all uppercase text-xs ${type === 'expense' ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}>Despesa</button>
                    <button onClick={() => setType('income')} className={`flex-1 py-3 rounded-md font-bold transition-all uppercase text-xs ${type === 'income' ? 'bg-green-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}>Receita</button>
                </div>
                <button onClick={() => { setType('payroll_deduction'); setCategory('DESCONTO EM FOLHA'); }} className={`w-full py-3 rounded-lg font-bold transition-all uppercase text-xs border-2 flex items-center justify-center gap-2 ${type === 'payroll_deduction' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50'}`}>
                    <Info size={16} /> Desconto em Folha
                </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Valor</label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-gray-500 text-lg font-bold">R$</span>
              <input type="tel" value={amountDisplay} onChange={(e) => handleAmountChange(e.target.value)} className="w-full pl-12 p-3 text-2xl border border-gray-300 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none font-bold text-gray-800 bg-blue-50/30" placeholder="0,00" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1 uppercase font-medium text-center">Os dois últimos números serão os centavos</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Descrição / Local</label>
            <input list="establishments-list" type="text" value={description} onChange={(e) => setDescription(e.target.value.toUpperCase())} placeholder="EX: SUPERMERCADO" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white uppercase font-bold text-sm" />
            <datalist id="establishments-list">
                {establishments.map(est => (<option key={est.id} value={est.name.toUpperCase()} />))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Categoria</label>
            {!showAddCategory ? (
                <div className="flex gap-2">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white uppercase font-bold text-sm">
                        <option value="">SELECIONE...</option>
                        {categories.map(cat => (<option key={cat.id} value={cat.name}>{cat.name.toUpperCase()}</option>))}
                        <option value="DESCONTO EM FOLHA">DESCONTO EM FOLHA</option>
                    </select>
                    <button onClick={() => setShowAddCategory(true)} className="p-3 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"><Plus size={24} /></button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value.toUpperCase())} placeholder="NOVA CATEGORIA" className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase font-bold" autoFocus />
                    <button onClick={handleAddCategory} className="px-4 bg-green-500 text-white rounded-lg font-bold">OK</button>
                    <button onClick={() => setShowAddCategory(false)} className="px-3 bg-gray-200 text-gray-700 rounded-lg font-bold">X</button>
                </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold bg-white" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Repetição</label>
            <select value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white uppercase font-bold text-sm">
              <option value="single">À VISTA (ÚNICO)</option>
              <option value="installment">PARCELADO</option>
              <option value="repeat">REPETIR (ASSINATURA)</option>
              <option value="fixed">FIXO (CONTAS)</option>
            </select>
          </div>

          {(recurrenceType === 'fixed' || recurrenceType === 'repeat' || recurrenceType === 'installment') && (
            <div className="flex gap-3">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Frequência</label>
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white uppercase text-xs font-bold">
                        <option value="monthly">MENSAL</option>
                        <option value="weekly">SEMANAL</option>
                        <option value="biweekly">QUINZENAL</option>
                    </select>
                </div>
                {(recurrenceType === 'installment' || recurrenceType === 'repeat') && (
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{recurrenceType === 'installment' ? 'Parcelas' : 'Vezes'}</label>
                        <input type="number" min="2" max="99" value={installments} onChange={(e) => setInstallments(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center" />
                    </div>
                )}
            </div>
          )}

          <div className="flex items-center gap-3 py-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <input type="checkbox" id="startNextMonth" checked={startNextMonth} onChange={(e) => setStartNextMonth(e.target.checked)} className="w-6 h-6 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
            <label htmlFor="startNextMonth" className="text-xs text-gray-700 select-none uppercase font-bold">Cobrar somente no mês seguinte?</label>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end shrink-0 md:rounded-b-xl pb-6 md:pb-4">
          <button onClick={onClose} className="flex-1 md:flex-none px-4 py-3 md:py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-bold uppercase text-sm">Cancelar</button>
          <button onClick={handleSubmit} className="flex-1 md:flex-none px-6 py-3 md:py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900 font-bold shadow-md uppercase text-sm">Salvar</button>
        </div>
      </div>
      )}
    </div>
  );
};

export default TransactionForm;
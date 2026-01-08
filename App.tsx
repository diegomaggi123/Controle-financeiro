import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, CategoryData, EstablishmentData, MonthlyBudget } from './types';
import { generateId, formatCurrency, formatDate, getMonthYearKey, getCategoryColor, exportToExcel, exportToPDF } from './utils';
import TransactionForm from './components/TransactionForm';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import SummaryCards from './components/SummaryCards';
import AnnualComparison from './components/AnnualComparison';
import BudgetProgress from './components/BudgetProgress';
import Auth from './components/Auth';
import GlobalSearch from './components/GlobalSearch';
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, Settings as SettingsIcon, Calendar, Repeat, Tag, BarChart3, List, LogOut, FileSpreadsheet, FileText, MoreVertical, AlertTriangle, Info, Search, X, History } from 'lucide-react';
import { format, subMonths, addMonths, parseISO, compareAsc, setMonth, setYear, subYears, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

type ViewMode = 'monthly' | 'annual';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentData[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, recurrenceType: string, type: string, groupId: string, description: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoadingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchData();
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    const { data: transData } = await supabase.from('transactions').select('*');
    if (transData) {
        setTransactions(transData.map((t: any) => ({
            id: t.id,
            groupId: t.group_id,
            description: t.description,
            amount: parseFloat(t.amount),
            type: t.type,
            category: t.category,
            date: t.date,
            billingDate: t.billing_date,
            recurrenceType: t.recurrence_type,
            installmentCurrent: t.installment_current,
            installmentTotal: t.installment_total
        })));
    }
    const { data: catData } = await supabase.from('categories').select('*');
    if (catData) setCategories(catData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    const { data: mbData } = await supabase.from('monthly_budgets').select('*');
    if (mbData) setMonthlyBudgets(mbData);
    const { data: estData } = await supabase.from('establishments').select('*');
    if (estData) setEstablishments(estData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  };

  useEffect(() => { if (session) fetchData(); }, [session]);

  const currentMonthKey = getMonthYearKey(currentDate);
  
  const filteredTransactions = useMemo(() => {
    let result = transactions.filter(t => t.billingDate.startsWith(currentMonthKey));

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        result = result.filter(t => 
            t.description.toLowerCase().includes(term) || 
            t.amount.toString().includes(term) ||
            t.category.toLowerCase().includes(term)
        );
    }

    return result.sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
  }, [transactions, currentDate, currentMonthKey, searchTerm]);

  const effectiveCategories = useMemo(() => {
    return categories.map(cat => {
        const specificBudget = monthlyBudgets.find(mb => mb.category_id === cat.id && mb.month_year === currentMonthKey);
        return { ...cat, budget: specificBudget ? specificBudget.amount : cat.budget };
    });
  }, [categories, monthlyBudgets, currentMonthKey]);

  const currentMonthName = format(currentDate, 'MMMM yyyy', { locale: ptBR });
  const currentYearVal = currentDate.getFullYear();

  const handleSaveTransaction = async (newTransactions: Transaction[], mode: 'create' | 'update', original?: Transaction, scope?: 'single' | 'future') => {
    if (!session) return;
    const toDbFormat = (t: Transaction) => ({
        id: t.id, user_id: session.user.id, group_id: t.groupId, description: t.description, amount: t.amount,
        type: t.type, category: t.category, date: t.date, billing_date: t.billingDate, 
        recurrence_type: t.recurrenceType,
        installment_current: t.installmentCurrent, 
        installment_total: t.installmentTotal
    });
    if (mode === 'create') {
        await supabase.from('transactions').insert(newTransactions.map(toDbFormat));
    } else if (original) {
      if (scope === 'single') {
        await supabase.from('transactions').upsert(toDbFormat(newTransactions[0]));
      } else {
        await supabase.from('transactions').delete().eq('group_id', original.groupId).gte('billing_date', original.billingDate);
        await supabase.from('transactions').insert(newTransactions.map(toDbFormat));
      }
    }
    fetchData();
  };

  const handleDeleteClick = (transaction: Transaction) => {
    setDeleteConfirmation({ 
        id: transaction.id, 
        recurrenceType: transaction.recurrenceType, 
        type: transaction.type,
        groupId: transaction.groupId, 
        description: transaction.description 
    });
  };

  const confirmDelete = async (scope: 'single' | 'future') => {
    if (!deleteConfirmation) return;
    if (scope === 'single') {
        await supabase.from('transactions').delete().eq('id', deleteConfirmation.id);
    } else {
        const target = transactions.find(t => t.id === deleteConfirmation.id);
        if (target) await supabase.from('transactions').delete().eq('group_id', deleteConfirmation.groupId).gte('billing_date', target.billingDate);
    }
    fetchData();
    setDeleteConfirmation(null);
  };

  const addCategory = async (name: string, budget: number = 0) => {
      if (!session) return;
      await supabase.from('categories').insert([{ name, budget, user_id: session.user.id }]);
      fetchData();
  };
  const updateCategory = async (id: string, name: string, budget: number = 0, scope: 'single' | 'future' = 'future') => {
      if (!session) return;
      if (scope === 'future') {
        await supabase.from('categories').update({ name, budget }).eq('id', id);
        await supabase.from('monthly_budgets').delete().eq('category_id', id).eq('month_year', currentMonthKey);
      } else {
        await supabase.from('monthly_budgets').upsert({ category_id: id, month_year: currentMonthKey, amount: budget, user_id: session.user.id }, { onConflict: 'category_id, month_year' });
      }
      fetchData();
  };
  const deleteCategory = async (id: string) => { await supabase.from('categories').delete().eq('id', id); fetchData(); };
  const addEstablishment = async (name: string) => { if (!session) return; await supabase.from('establishments').insert([{ name, user_id: session.user.id }]); fetchData(); };
  const updateEstablishment = async (id: string, name: string) => { await supabase.from('establishments').update({ name }).eq('id', id); fetchData(); };
  const deleteEstablishment = async (id: string) => { await supabase.from('establishments').delete().eq('id', id); fetchData(); };

  const handleNavigateToPeriod = (date: Date) => {
      setCurrentDate(date);
      setViewMode('monthly');
  };

  if (isLoadingSession) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-800 font-bold uppercase">Carregando...</div>;
  if (!session) return <Auth />;

  return (
    <div className="min-h-screen pb-32 md:pb-20 bg-gray-50">
      <header className="bg-blue-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
          <div className="flex w-full md:w-auto items-center justify-between">
              <h1 className="text-lg font-bold truncate">Financeiro Diego</h1>
              <div className="flex gap-1 md:hidden">
                  <button 
                    onClick={() => setIsGlobalSearchOpen(true)} 
                    className="p-2 hover:bg-blue-700 rounded-full"
                    title="Pesquisa Global"
                  >
                    <History size={22} />
                  </button>
                  <button 
                    onClick={() => setViewMode(viewMode === 'monthly' ? 'annual' : 'monthly')} 
                    className="p-2 hover:bg-blue-700 rounded-full"
                    title={viewMode === 'monthly' ? "Mudar para Anual" : "Mudar para Mensal"}
                  >
                    {viewMode === 'monthly' ? <BarChart3 size={22} /> : <List size={22} />}
                  </button>
                  <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-blue-700 rounded-full"><SettingsIcon size={22} /></button>
                  <button onClick={async () => { await supabase.auth.signOut(); setSession(null); }} className="p-2 hover:bg-blue-700 rounded-full"><LogOut size={22} /></button>
              </div>
          </div>
          <div className="flex items-center justify-center bg-blue-900/40 rounded-full px-4 py-1.5 w-full md:w-auto">
            <button onClick={() => { setCurrentDate(viewMode === 'monthly' ? subMonths(currentDate, 1) : subYears(currentDate, 1)); setSearchTerm(''); }} className="p-2 hover:bg-blue-700 rounded-full"><ChevronLeft size={24} /></button>
            <div className="relative group mx-4 flex-1 md:min-w-[180px] text-center flex items-center justify-center h-10">
                <span className="font-bold uppercase text-lg truncate">{viewMode === 'monthly' ? currentMonthName : `Ano ${currentYearVal}`}</span>
                <select value={currentDate.getMonth()} onChange={(e) => { setCurrentDate(new Date(currentDate.getFullYear(), parseInt(e.target.value), 1)); setSearchTerm(''); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none">
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (<option key={m} value={m}>{format(new Date(2000, m, 1), 'MMMM', { locale: ptBR }).toUpperCase()}</option>))}
                </select>
            </div>
            <button onClick={() => { setCurrentDate(viewMode === 'monthly' ? addMonths(currentDate, 1) : addYears(currentDate, 1)); setSearchTerm(''); }} className="p-2 hover:bg-blue-700 rounded-full"><ChevronRight size={24} /></button>
          </div>
          <div className="flex items-center gap-2 hidden md:flex">
            <button 
                onClick={() => setIsGlobalSearchOpen(true)} 
                className="flex items-center gap-2 bg-blue-700/50 px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors uppercase font-bold"
                title="Histórico Completo"
            >
                <History size={16} /> Histórico
            </button>
            <button onClick={() => setViewMode(viewMode === 'monthly' ? 'annual' : 'monthly')} className="flex items-center gap-2 bg-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors uppercase">
                {viewMode === 'monthly' ? <><BarChart3 size={16} /> Anual</> : <><List size={16} /> Mensal</>}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-blue-700 rounded-full"><SettingsIcon size={20} /></button>
            <button onClick={async () => { await supabase.auth.signOut(); setSession(null); }} className="p-2 hover:bg-blue-700 rounded-full"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {viewMode === 'annual' ? (
             <AnnualComparison 
                transactions={transactions} 
                currentYear={currentDate} 
                categories={categories} 
                monthlyBudgets={monthlyBudgets}
                onExportExcel={() => exportToExcel(transactions, 'anual')} 
                onExportPDF={() => exportToPDF(transactions, 'anual')} 
              />
        ) : (
            <>
                <SummaryCards transactions={filteredTransactions} categories={effectiveCategories} />
                <BudgetProgress transactions={filteredTransactions} categories={effectiveCategories} onUpdateCategory={updateCategory} currentMonthName={currentMonthName} />

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b flex flex-col md:flex-row gap-4 md:items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-2">
                             <h2 className="text-lg font-bold text-gray-800 uppercase">Lançamentos</h2>
                             <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">{filteredTransactions.length}</span>
                        </div>
                        
                        <div className="relative flex-1 max-w-md">
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <Search size={18} />
                            </div>
                            <input 
                                type="text" 
                                placeholder="BUSCAR NESTA LISTA..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-10 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                
                    <div className="md:hidden">
                        <ul className="divide-y divide-gray-100">
                            {filteredTransactions.length > 0 ? filteredTransactions.map(t => (
                                <li key={t.id} className="p-4 flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-800 uppercase text-sm mb-1">{t.description}</h3>
                                            <div className="flex flex-wrap gap-2 items-center mb-1">
                                                 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getCategoryColor(t.category)}`}>
                                                    {t.category}
                                                </span>
                                                <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={12} /> {formatDate(t.date)}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-400 uppercase font-bold">
                                                {t.type === 'payroll_deduction' && <span className="text-indigo-600 flex items-center gap-1"><Info size={10} /> DESCONTO EM FOLHA</span>}
                                                {(t.recurrenceType === 'installment' || t.recurrenceType === 'repeat') && <span>Parc. {t.installmentCurrent}/{t.installmentTotal}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`block font-bold text-lg ${t.type === 'income' ? 'text-green-600' : t.type === 'expense' ? 'text-red-600' : 'text-indigo-600'}`}>
                                                {t.type === 'expense' || t.type === 'payroll_deduction' ? '-' : '+'}{formatCurrency(t.amount)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-4 mt-1 border-t border-gray-50 pt-2">
                                        <button onClick={() => { setEditingTransaction(t); setIsFormOpen(true); }} className="text-blue-600 text-xs font-bold uppercase flex items-center gap-1 p-2"><Edit2 size={14} /> Editar</button>
                                        <button onClick={() => handleDeleteClick(t)} className="text-red-600 text-xs font-bold uppercase flex items-center gap-1 p-2"><Trash2 size={14} /> Excluir</button>
                                    </div>
                                </li>
                            )) : (
                                <li className="p-8 text-center text-gray-400 font-bold uppercase text-sm">Nenhum lançamento encontrado</li>
                            )}
                        </ul>
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs border-b uppercase font-bold">
                            <th className="p-4">Data</th>
                            <th className="p-4">Descrição</th>
                            <th className="p-4">Categoria</th>
                            <th className="p-4 text-right">Valor</th>
                            <th className="p-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredTransactions.length > 0 ? filteredTransactions.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="p-4 text-sm text-gray-600">{formatDate(t.date)}</td>
                                <td className="p-4 font-bold text-gray-800 uppercase text-sm">
                                    <div className="flex flex-col">
                                        {t.description}
                                        {t.type === 'payroll_deduction' && <span className="text-[9px] text-indigo-500 font-bold">DESCONTO EM FOLHA</span>}
                                    </div>
                                </td>
                                <td className="p-4"><span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase ${getCategoryColor(t.category)}`}>{t.category}</span></td>
                                <td className={`p-4 font-bold text-right ${t.type === 'income' ? 'text-green-600' : t.type === 'expense' ? 'text-red-600' : 'text-indigo-600'}`}>
                                    {t.type === 'expense' || t.type === 'payroll_deduction' ? '- ' : '+ '}{formatCurrency(t.amount)}
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingTransaction(t); setIsFormOpen(true); }} className="p-1 text-blue-600 hover:bg-blue-100 rounded"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDeleteClick(t)} className="p-1 text-red-600 hover:bg-red-100 rounded"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-400 font-bold uppercase text-sm">Nenhum lançamento encontrado</td>
                                </tr>
                            )}
                        </tbody>
                        </table>
                    </div>
                </div>
                <Dashboard transactions={filteredTransactions} currentMonthName={currentMonthName} />
            </>
        )}
      </main>

      <button onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }} className="fixed bottom-6 right-6 bg-blue-800 text-white w-14 h-14 rounded-full shadow-xl hover:scale-105 transition-all z-40 flex items-center justify-center"><Plus size={28} /></button>

      <TransactionForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSave={handleSaveTransaction} initialData={editingTransaction} categories={categories} establishments={establishments} onAddCategory={addCategory} onAddEstablishment={addEstablishment} />
      {isSettingsOpen && <Settings categories={effectiveCategories} establishments={establishments} onClose={() => setIsSettingsOpen(false)} onAddCategory={addCategory} onUpdateCategory={updateCategory} onDeleteCategory={deleteCategory} onAddEstablishment={addEstablishment} onUpdateEstablishment={updateEstablishment} onDeleteEstablishment={deleteEstablishment} currentMonthName={currentMonthName} />}
      
      <GlobalSearch 
        isOpen={isGlobalSearchOpen} 
        onClose={() => setIsGlobalSearchOpen(false)} 
        transactions={transactions} 
        onNavigateToPeriod={handleNavigateToPeriod} 
      />

      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-lg p-6 w-full max-w-sm shadow-xl">
                <div className="flex items-center gap-3 mb-4 text-red-600"><AlertTriangle size={24} /><h3 className="text-lg font-bold uppercase">Confirmar Exclusão</h3></div>
                <p className="mb-2 text-gray-800 font-bold uppercase">{deleteConfirmation.description}</p>
                
                {deleteConfirmation.type === 'payroll_deduction' ? (
                     <p className="mb-6 text-gray-600 text-sm uppercase font-bold text-indigo-600">
                        O que deseja excluir deste Desconto em Folha?
                     </p>
                ) : deleteConfirmation.recurrenceType === 'single' ? (
                     <p className="mb-6 text-gray-600 text-sm uppercase">
                        Tem certeza que deseja excluir?
                     </p>
                ) : (
                    <p className="mb-6 text-gray-600 text-sm uppercase">
                        Este é um item recorrente. O que deseja excluir?
                    </p>
                )}

                <div className="flex flex-col gap-3">
                    {(deleteConfirmation.type === 'payroll_deduction' || deleteConfirmation.recurrenceType !== 'single') ? (
                        <>
                             <button 
                                onClick={() => confirmDelete('single')}
                                className="p-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-left font-bold text-gray-700 uppercase"
                            >
                                Apenas este lançamento
                            </button>
                            <button 
                                onClick={() => confirmDelete('future')}
                                className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-left font-bold uppercase shadow-sm"
                            >
                                Este e os futuros
                            </button>
                        </>
                    ) : (
                        <button onClick={() => confirmDelete('single')} className="p-4 bg-red-600 text-white rounded-lg font-bold uppercase shadow-sm">Sim, Excluir</button>
                    )}
                    <button onClick={() => setDeleteConfirmation(null)} className="py-3 text-sm text-gray-500 uppercase font-bold">Cancelar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
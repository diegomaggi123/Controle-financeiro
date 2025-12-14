import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, CategoryData, EstablishmentData } from './types';
import { generateId, formatCurrency, formatDate, getMonthYearKey, getCategoryColor, exportToExcel, exportToPDF } from './utils';
import TransactionForm from './components/TransactionForm';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import SummaryCards from './components/SummaryCards';
import AnnualComparison from './components/AnnualComparison';
import Auth from './components/Auth';
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, Settings as SettingsIcon, Calendar, Repeat, Tag, BarChart3, List, LogOut, FileSpreadsheet, FileText } from 'lucide-react';
import { format, subMonths, addMonths, parseISO, compareAsc, setMonth, setYear, subYears, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

type ViewMode = 'monthly' | 'annual';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // App State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentData[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, recurrenceType: string, groupId: string } | null>(null);
  
  // --- Auth & Data Fetching ---

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchData();
      else {
          setTransactions([]);
          setCategories([]);
          setEstablishments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    // RLS in Supabase will automatically filter by the logged-in user
    
    // Fetch Transactions
    const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*');
    
    if (!transError && transData) {
        const mappedTransactions: Transaction[] = transData.map((t: any) => ({
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
        }));
        setTransactions(mappedTransactions);
    }

    // Fetch Categories
    const { data: catData } = await supabase.from('categories').select('*');
    if (catData) {
      // Sort alphabetically
      const sortedCats = catData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setCategories(sortedCats);
    }

    // Fetch Establishments
    const { data: estData } = await supabase.from('establishments').select('*');
    if (estData) {
      // Sort alphabetically
      const sortedEsts = estData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setEstablishments(sortedEsts);
    }
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  // Derived State
  const filteredTransactions = useMemo(() => {
    const targetKey = getMonthYearKey(currentDate);
    // Filter by billingDate, sort by purchase date
    return transactions
      .filter(t => t.billingDate.startsWith(targetKey))
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
  }, [transactions, currentDate]);

  const currentMonthName = format(currentDate, 'MMMM yyyy', { locale: ptBR });
  const currentYearVal = currentDate.getFullYear();

  // --- Handlers ---

  const handleSaveTransaction = async (
    newTransactions: Transaction[], 
    mode: 'create' | 'update', 
    original?: Transaction,
    scope?: 'single' | 'future'
  ) => {
    if (!session) return;

    // 1. Prepare data for DB (convert to snake_case and add user_id)
    const toDbFormat = (t: Transaction) => ({
        id: t.id,
        user_id: session.user.id, // VITAL for RLS
        group_id: t.groupId,
        description: t.description,
        amount: t.amount,
        type: t.type,
        category: t.category,
        date: t.date,
        billing_date: t.billingDate,
        recurrence_type: t.recurrenceType,
        installment_current: t.installmentCurrent,
        installment_total: t.installmentTotal
    });

    if (mode === 'create') {
        const payload = newTransactions.map(toDbFormat);
        await supabase.from('transactions').insert(payload);
        fetchData(); 
    } else if (original) {
      if (scope === 'single') {
        const t = newTransactions[0];
        await supabase.from('transactions').upsert(toDbFormat(t));
      } else {
        // Future Scope
        const gid = original.groupId;
        const cutoffDate = original.billingDate;
        
        // 1. Delete future transactions of this group (RLS handles permission)
        await supabase
            .from('transactions')
            .delete()
            .eq('group_id', gid)
            .gte('billing_date', cutoffDate);
        
        // 2. Insert new versions
        const payload = newTransactions.map(toDbFormat);
        await supabase.from('transactions').insert(payload);
      }
      fetchData(); 
    }
  };

  const handleDeleteClick = (transaction: Transaction) => {
    if (transaction.recurrenceType === 'single') {
        supabase.from('transactions').delete().eq('id', transaction.id).then(() => fetchData());
    } else {
        setDeleteConfirmation({ id: transaction.id, recurrenceType: transaction.recurrenceType, groupId: transaction.groupId });
    }
  };

  const confirmDelete = async (scope: 'single' | 'future') => {
    if (!deleteConfirmation) return;
    
    if (scope === 'single') {
        await supabase.from('transactions').delete().eq('id', deleteConfirmation.id);
    } else {
        const target = transactions.find(t => t.id === deleteConfirmation.id);
        if (target) {
            await supabase
                .from('transactions')
                .delete()
                .eq('group_id', deleteConfirmation.groupId)
                .gte('billing_date', target.billingDate);
        }
    }
    fetchData();
    setDeleteConfirmation(null);
  };

  // Settings Handlers (Supabase)
  const addCategory = async (name: string) => {
      if (!session) return;
      await supabase.from('categories').insert([{ name, user_id: session.user.id }]);
      fetchData();
  };
  const updateCategory = async (id: string, name: string) => {
      await supabase.from('categories').update({ name }).eq('id', id);
      fetchData();
  };
  const deleteCategory = async (id: string) => {
      await supabase.from('categories').delete().eq('id', id);
      fetchData();
  };
  
  const addEstablishment = async (name: string) => {
      if (!session) return;
      await supabase.from('establishments').insert([{ name, user_id: session.user.id }]);
      fetchData();
  };
  const updateEstablishment = async (id: string, name: string) => {
      await supabase.from('establishments').update({ name }).eq('id', id);
      fetchData();
  };
  const deleteEstablishment = async (id: string) => {
      await supabase.from('establishments').delete().eq('id', id);
      fetchData();
  };

  const handleMonthSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const monthIndex = parseInt(e.target.value);
      const newDate = new Date(currentDate.getFullYear(), monthIndex, 1);
      setCurrentDate(newDate);
  };
  
  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const year = parseInt(e.target.value);
      if (year) {
          const newDate = setYear(currentDate, year);
          setCurrentDate(newDate);
      }
  };

  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
    } finally {
        // Force local state update to ensure UI reflects logout immediately
        setSession(null);
        setTransactions([]);
        setCategories([]);
        setEstablishments([]);
    }
  };

  const handleExportExcel = () => {
      const fileName = `financeiro_${format(currentDate, 'yyyy_MM')}`;
      exportToExcel(filteredTransactions, fileName);
  };

  const handleExportPDF = () => {
      const title = `Relatório ${currentMonthName}`;
      exportToPDF(filteredTransactions, title.toUpperCase());
  };

  if (isLoadingSession) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-800">Carregando...</div>;
  }

  if (!session) {
      return <Auth />;
  }

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Compact Header */}
      <header className="bg-blue-800 text-white sticky top-0 z-30 shadow-md transition-all">
        <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-2 md:gap-0">
          
          {/* Left: Title + Mobile Settings/Logout */}
          <div className="flex w-full md:w-auto items-center justify-between">
              <h1 className="text-lg font-bold truncate">Controle Financeiro Diego</h1>
              <div className="flex gap-2 md:hidden">
                  <button 
                      onClick={() => setIsSettingsOpen(true)}
                      className="p-1 hover:bg-blue-700 rounded-full"
                      title="Configurações"
                  >
                      <SettingsIcon size={20} />
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="p-1 hover:bg-blue-700 rounded-full"
                    title="Sair"
                  >
                    <LogOut size={20} />
                  </button>
              </div>
          </div>
          
          {/* Center: Navigation */}
          <div className="flex items-center justify-center bg-blue-900/40 rounded-full px-2 py-1 relative">
            <button 
                onClick={() => setCurrentDate(viewMode === 'monthly' ? subMonths(currentDate, 1) : subYears(currentDate, 1))}
                className="p-1 hover:bg-blue-700 rounded-full transition-colors"
            >
                <ChevronLeft size={20} />
            </button>
            
            <div className="relative group mx-2 min-w-[150px] text-center flex items-center justify-center">
                <span 
                    className="font-semibold capitalize text-lg text-center block select-none px-2 py-1 uppercase"
                >
                    {viewMode === 'monthly' ? currentMonthName : `Ano ${currentYearVal}`}
                </span>
                
                {viewMode === 'monthly' ? (
                    <select
                        value={currentDate.getMonth()}
                        onChange={handleMonthSelectChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none text-black uppercase"
                        title="Alterar mês"
                    >
                        {Array.from({ length: 12 }, (_, i) => i).map((monthIndex) => {
                            const monthName = format(new Date(currentDate.getFullYear(), monthIndex, 1), 'MMMM', { locale: ptBR });
                            const capitalizedMonth = monthName.toUpperCase();
                            return (
                                <option key={monthIndex} value={monthIndex}>
                                    {capitalizedMonth}
                                </option>
                            );
                        })}
                    </select>
                ) : (
                    <select
                        value={currentYearVal}
                        onChange={handleYearChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none text-black"
                        aria-label="Escolher ano"
                    >
                        {Array.from({ length: 11 }, (_, i) => currentYearVal - 5 + i).map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                )}
            </div>

            <button 
                onClick={() => setCurrentDate(viewMode === 'monthly' ? addMonths(currentDate, 1) : addYears(currentDate, 1))}
                className="p-1 hover:bg-blue-700 rounded-full transition-colors"
            >
                <ChevronRight size={20} />
            </button>
          </div>

          {/* Right: View Toggle + Settings + Logout (Desktop) */}
          <div className="flex items-center gap-2">
            <button
                onClick={() => setViewMode(viewMode === 'monthly' ? 'annual' : 'monthly')}
                className="flex items-center gap-2 bg-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors hidden md:flex uppercase"
            >
                {viewMode === 'monthly' ? (
                    <><BarChart3 size={16} /> Anual</>
                ) : (
                    <><List size={16} /> Mensal</>
                )}
            </button>
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-blue-700 rounded-full hidden md:block"
                title="Configurações"
            >
                <SettingsIcon size={20} />
            </button>
             <button 
                onClick={handleLogout}
                className="p-2 hover:bg-blue-700 rounded-full hidden md:block"
                title="Sair"
            >
                <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        
        {viewMode === 'annual' ? (
             <AnnualComparison transactions={transactions} currentYear={currentDate} />
        ) : (
            <>
                {/* Summary Cards */}
                <SummaryCards transactions={filteredTransactions} />

                {/* Transaction List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800 uppercase">Lançamentos</h2>
                    <div className="flex gap-2 items-center">
                        <button 
                            onClick={handleExportExcel}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors uppercase"
                            title="Exportar para Excel"
                        >
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button 
                            onClick={handleExportPDF}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors uppercase"
                            title="Exportar para PDF"
                        >
                            <FileText size={16} /> PDF
                        </button>
                        <span className="text-sm text-gray-500 ml-2 border-l pl-3">{filteredTransactions.length} registros</span>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 text-sm border-b uppercase">
                        <th className="p-4 font-medium">Data Compra</th>
                        <th className="p-4 font-medium">Descrição</th>
                        <th className="p-4 font-medium">Categoria</th>
                        <th className="p-4 font-medium">Tipo</th>
                        <th className="p-4 font-medium text-right">Valor</th>
                        <th className="p-4 font-medium text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredTransactions.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-400">
                            Nenhum lançamento neste mês.
                            </td>
                        </tr>
                        ) : (
                        filteredTransactions.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                            <td className="p-4 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-gray-400" />
                                {formatDate(t.date)}
                                </div>
                            </td>
                            <td className="p-4 font-medium text-gray-800 uppercase">
                                {t.description}
                            </td>
                            <td className="p-4 text-sm">
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium uppercase ${getCategoryColor(t.category)}`}>
                                <Tag size={12} /> {t.category}
                                </span>
                            </td>
                            <td className="p-4 text-sm text-gray-500 uppercase">
                                {(t.recurrenceType === 'installment' || t.recurrenceType === 'repeat') && (
                                <span className="flex items-center gap-1">
                                    <Repeat size={14} />
                                    {t.installmentCurrent}/{t.installmentTotal}
                                </span>
                                )}
                                {t.recurrenceType === 'fixed' && (
                                    <span className="text-gray-500">
                                        Fixo
                                    </span>
                                )}
                                {t.recurrenceType === 'single' && (
                                    <span className="text-gray-500">À vista</span>
                                )}
                            </td>
                            <td className={`p-4 font-bold text-right ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                {t.type === 'expense' ? '- ' : '+ '}
                                {formatCurrency(t.amount)}
                            </td>
                            <td className="p-4 text-center">
                                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        setEditingTransaction(t);
                                        setIsFormOpen(true);
                                    }}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button 
                                    onClick={() => handleDeleteClick(t)}
                                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                                >
                                    <Trash2 size={16} />
                                </button>
                                </div>
                            </td>
                            </tr>
                        ))
                        )}
                    </tbody>
                    </table>
                </div>
                </div>

                <Dashboard transactions={filteredTransactions} currentMonthName={currentMonthName} />
            </>
        )}

      </main>

      {/* Floating Action Button */}
      {viewMode === 'monthly' && (
        <button
            onClick={() => {
                setEditingTransaction(null);
                setIsFormOpen(true);
            }}
            className="fixed bottom-6 right-6 bg-blue-800 text-white px-6 py-4 rounded-full shadow-lg hover:bg-blue-900 hover:scale-105 transition-all z-40 flex items-center gap-2 font-bold text-lg uppercase"
        >
            <Plus size={24} />
            Novo Lançamento
        </button>
      )}

      {/* Modals */}
      <TransactionForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSave={handleSaveTransaction}
        initialData={editingTransaction}
        categories={categories}
        establishments={establishments}
        onAddCategory={addCategory}
        onAddEstablishment={addEstablishment}
      />

      {isSettingsOpen && (
        <Settings 
            categories={categories}
            establishments={establishments}
            onClose={() => setIsSettingsOpen(false)}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
            onAddEstablishment={addEstablishment}
            onUpdateEstablishment={updateEstablishment}
            onDeleteEstablishment={deleteEstablishment}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-gray-800 uppercase">Confirmar Exclusão</h3>
                <p className="mb-6 text-gray-600 uppercase">Este é um item recorrente/parcelado. O que deseja excluir?</p>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => confirmDelete('single')}
                        className="p-3 bg-gray-100 hover:bg-gray-200 rounded text-left font-medium uppercase"
                    >
                        Apenas este lançamento
                    </button>
                    <button 
                        onClick={() => confirmDelete('future')}
                        className="p-3 bg-red-600 hover:bg-red-700 text-white rounded text-left font-medium uppercase"
                    >
                        Este e os futuros
                    </button>
                    <button 
                        onClick={() => setDeleteConfirmation(null)}
                        className="mt-2 text-sm text-gray-500 hover:underline text-center uppercase"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
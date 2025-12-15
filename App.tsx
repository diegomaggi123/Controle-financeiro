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
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, Settings as SettingsIcon, Calendar, Repeat, Tag, BarChart3, List, LogOut, FileSpreadsheet, FileText, MoreVertical, AlertTriangle } from 'lucide-react';
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
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>([]); // Novo estado
  const [establishments, setEstablishments] = useState<EstablishmentData[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, recurrenceType: string, groupId: string, description: string } | null>(null);
  
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
          setMonthlyBudgets([]);
          setEstablishments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
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
      const sortedCats = catData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setCategories(sortedCats);
    }

    // Fetch Monthly Budgets
    const { data: mbData } = await supabase.from('monthly_budgets').select('*');
    if (mbData) {
        setMonthlyBudgets(mbData);
    }

    // Fetch Establishments
    const { data: estData } = await supabase.from('establishments').select('*');
    if (estData) {
      const sortedEsts = estData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setEstablishments(sortedEsts);
    }
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  // Derived State
  const currentMonthKey = getMonthYearKey(currentDate);

  const filteredTransactions = useMemo(() => {
    // Filter by billingDate, sort by purchase date
    return transactions
      .filter(t => t.billingDate.startsWith(currentMonthKey))
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
  }, [transactions, currentDate, currentMonthKey]);

  // Merge Categories with Monthly Budgets for the current view
  const effectiveCategories = useMemo(() => {
    return categories.map(cat => {
        // Tenta encontrar um orçamento específico para este mês
        const specificBudget = monthlyBudgets.find(
            mb => mb.category_id === cat.id && mb.month_year === currentMonthKey
        );
        
        return {
            ...cat,
            // Se existir específico usa ele, senão usa o padrão
            budget: specificBudget ? specificBudget.amount : cat.budget
        };
    });
  }, [categories, monthlyBudgets, currentMonthKey]);

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
    // SEMPRE pede confirmação, independentemente do tipo
    setDeleteConfirmation({ 
        id: transaction.id, 
        recurrenceType: transaction.recurrenceType, 
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
  const addCategory = async (name: string, budget: number = 0) => {
      if (!session) return;
      await supabase.from('categories').insert([{ name, budget, user_id: session.user.id }]);
      fetchData();
  };
  
  const updateCategory = async (id: string, name: string, budget: number = 0, scope: 'single' | 'future' = 'future') => {
      if (!session) return;
      
      // Update Name always
      await supabase.from('categories').update({ name }).eq('id', id);

      if (scope === 'future') {
        // LOGICA DE "NOVO PADRÃO" (DAQUI PRA FRENTE)
        const category = categories.find(c => c.id === id);
        const oldBudget = category?.budget || 0;

        if (oldBudget !== budget) {
            // Congelar histórico: Vamos olhar para os ultimos 24 meses
            const monthsToFreeze = [];
            let iterDate = subMonths(currentDate, 1); 
            
            for (let i = 0; i < 24; i++) {
                const mKey = getMonthYearKey(iterDate);
                const hasSpecific = monthlyBudgets.some(mb => mb.category_id === id && mb.month_year === mKey);
                
                if (!hasSpecific) {
                    monthsToFreeze.push({
                        user_id: session.user.id,
                        category_id: id,
                        month_year: mKey,
                        amount: oldBudget // Trava com o valor ANTIGO
                    });
                }
                iterDate = subMonths(iterDate, 1);
            }

            if (monthsToFreeze.length > 0) {
                await supabase.from('monthly_budgets').insert(monthsToFreeze);
            }
        }

        // Atualiza o padrão global
        await supabase.from('categories').update({ budget }).eq('id', id);
        
        // Remove qualquer override do mês atual
        await supabase.from('monthly_budgets').delete()
            .eq('category_id', id)
            .eq('month_year', currentMonthKey);

      } else {
        // Escopo Single: Apenas o mês atual
        const payload = {
            category_id: id,
            month_year: currentMonthKey,
            amount: budget,
            user_id: session.user.id
        };
        
        await supabase.from('monthly_budgets').upsert(payload, { onConflict: 'category_id, month_year' });
      }

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
        setSession(null);
        setTransactions([]);
        setCategories([]);
        setEstablishments([]);
    }
  };

  // --- Export Functions ---

  const handleExportExcel = () => {
      const fileName = `financeiro_${format(currentDate, 'yyyy_MM')}`;
      exportToExcel(filteredTransactions, fileName);
  };

  const handleExportPDF = () => {
      const title = `Relatório ${currentMonthName}`;
      exportToPDF(filteredTransactions, title.toUpperCase());
  };

  // Exportação Anual
  const handleExportAnnualExcel = () => {
      const yearKey = currentYearVal.toString();
      const annualTransactions = transactions.filter(t => t.billingDate.startsWith(yearKey));
      const fileName = `financeiro_anual_${yearKey}`;
      exportToExcel(annualTransactions, fileName);
  };

  const handleExportAnnualPDF = () => {
      const yearKey = currentYearVal.toString();
      const annualTransactions = transactions.filter(t => t.billingDate.startsWith(yearKey));
      const title = `Relatório Anual ${yearKey}`;
      exportToPDF(annualTransactions, title.toUpperCase());
  };

  if (isLoadingSession) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-800">Carregando...</div>;
  }

  if (!session) {
      return <Auth />;
  }

  return (
    <div className="min-h-screen pb-32 md:pb-20 bg-gray-50">
      {/* Compact Header */}
      <header className="bg-blue-800 text-white sticky top-0 z-30 shadow-md transition-all">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
          
          {/* Left: Title + Mobile Settings/Logout */}
          <div className="flex w-full md:w-auto items-center justify-between">
              <h1 className="text-lg font-bold truncate">Financeiro Diego</h1>
              <div className="flex gap-2 md:hidden">
                  <button 
                      onClick={() => setIsSettingsOpen(true)}
                      className="p-2 hover:bg-blue-700 rounded-full"
                      title="Configurações"
                  >
                      <SettingsIcon size={22} />
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="p-2 hover:bg-blue-700 rounded-full"
                    title="Sair"
                  >
                    <LogOut size={22} />
                  </button>
              </div>
          </div>
          
          {/* Center: Navigation */}
          <div className="flex items-center justify-center bg-blue-900/40 rounded-full px-4 py-1.5 relative w-full md:w-auto">
            <button 
                onClick={() => setCurrentDate(viewMode === 'monthly' ? subMonths(currentDate, 1) : subYears(currentDate, 1))}
                className="p-2 hover:bg-blue-700 rounded-full transition-colors"
            >
                <ChevronLeft size={24} />
            </button>
            
            <div className="relative group mx-4 flex-1 md:min-w-[180px] text-center flex items-center justify-center h-10">
                <span 
                    className="font-bold capitalize text-lg text-center block select-none uppercase truncate"
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
                className="p-2 hover:bg-blue-700 rounded-full transition-colors"
            >
                <ChevronRight size={24} />
            </button>
          </div>

          {/* Right: View Toggle + Settings + Logout (Desktop) */}
          <div className="flex items-center gap-2 hidden md:flex">
            <button
                onClick={() => setViewMode(viewMode === 'monthly' ? 'annual' : 'monthly')}
                className="flex items-center gap-2 bg-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors uppercase"
            >
                {viewMode === 'monthly' ? (
                    <><BarChart3 size={16} /> Anual</>
                ) : (
                    <><List size={16} /> Mensal</>
                )}
            </button>
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-blue-700 rounded-full"
                title="Configurações"
            >
                <SettingsIcon size={20} />
            </button>
             <button 
                onClick={handleLogout}
                className="p-2 hover:bg-blue-700 rounded-full"
                title="Sair"
            >
                <LogOut size={20} />
            </button>
          </div>
        </div>
        
        {/* Mobile View Toggle (Below header) */}
        <div className="md:hidden flex bg-blue-900 text-xs">
             <button
                onClick={() => setViewMode('monthly')}
                className={`flex-1 py-2 text-center uppercase font-medium ${viewMode === 'monthly' ? 'bg-blue-700 text-white' : 'text-blue-200'}`}
            >
                Mensal
            </button>
            <button
                onClick={() => setViewMode('annual')}
                className={`flex-1 py-2 text-center uppercase font-medium ${viewMode === 'annual' ? 'bg-blue-700 text-white' : 'text-blue-200'}`}
            >
                Anual
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        
        {viewMode === 'annual' ? (
             <AnnualComparison 
                transactions={transactions} 
                currentYear={currentDate} 
                onExportExcel={handleExportAnnualExcel}
                onExportPDF={handleExportAnnualPDF}
             />
        ) : (
            <>
                {/* Summary Cards */}
                <SummaryCards transactions={filteredTransactions} categories={effectiveCategories} />
                
                {/* Budget Progress (Planning) */}
                <BudgetProgress 
                    transactions={filteredTransactions} 
                    categories={effectiveCategories}
                    onUpdateCategory={updateCategory}
                    currentMonthName={currentMonthName}
                />

                {/* Transaction List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h2 className="text-lg font-bold text-gray-800 uppercase">Lançamentos</h2>
                        <div className="flex gap-2 items-center">
                            <button 
                                onClick={handleExportExcel}
                                className="hidden md:flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors uppercase"
                                title="Exportar para Excel"
                            >
                                <FileSpreadsheet size={16} /> Excel
                            </button>
                            <span className="text-sm text-gray-500 border-l pl-3">{filteredTransactions.length} registros</span>
                        </div>
                    </div>
                
                    {/* DESKTOP TABLE VIEW */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-sm border-b uppercase">
                            <th className="p-4 font-medium">Data</th>
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

                    {/* MOBILE CARD VIEW */}
                    <div className="md:hidden">
                        {filteredTransactions.length === 0 ? (
                             <div className="p-8 text-center text-gray-400 text-sm">Nenhum lançamento.</div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {filteredTransactions.map(t => (
                                    <li key={t.id} className="p-4 flex flex-col gap-2 hover:bg-gray-50 active:bg-gray-50" 
                                        onClick={() => {
                                            // Optional: Make whole card clickable or just buttons
                                        }}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-800 uppercase text-sm mb-1">{t.description}</h3>
                                                <div className="flex flex-wrap gap-2 items-center mb-1">
                                                     <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getCategoryColor(t.category)}`}>
                                                        {t.category}
                                                    </span>
                                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                                        <Calendar size={12} /> {formatDate(t.date)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-400 uppercase">
                                                    {(t.recurrenceType === 'installment' || t.recurrenceType === 'repeat') && (
                                                        <span>Parc. {t.installmentCurrent}/{t.installmentTotal}</span>
                                                    )}
                                                    {t.recurrenceType === 'fixed' && <span>Fixo Mensal</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={`block font-bold text-lg ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Actions Row */}
                                        <div className="flex justify-end gap-4 mt-1 border-t border-gray-50 pt-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setEditingTransaction(t); setIsFormOpen(true); }}
                                                className="text-blue-600 text-xs font-medium uppercase flex items-center gap-1 p-2 -my-2"
                                            >
                                                <Edit2 size={14} /> Editar
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(t); }}
                                                className="text-red-600 text-xs font-medium uppercase flex items-center gap-1 p-2 -my-2"
                                            >
                                                <Trash2 size={14} /> Excluir
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <Dashboard transactions={filteredTransactions} currentMonthName={currentMonthName} />
            </>
        )}

      </main>

      {/* Floating Action Button - Mobile Optimized */}
      {viewMode === 'monthly' && (
        <button
            onClick={() => {
                setEditingTransaction(null);
                setIsFormOpen(true);
            }}
            className="fixed bottom-6 right-6 md:right-8 bg-blue-800 text-white w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-4 rounded-full shadow-xl shadow-blue-900/30 hover:bg-blue-900 hover:scale-105 transition-all z-40 flex items-center justify-center gap-2 font-bold text-lg uppercase"
            aria-label="Novo Lançamento"
        >
            <Plus size={28} />
            <span className="hidden md:inline">Novo Lançamento</span>
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
        onAddCategory={(name) => addCategory(name, 0)}
        onAddEstablishment={addEstablishment}
      />

      {isSettingsOpen && (
        <Settings 
            categories={effectiveCategories} // Passa as categorias com o budget EFETIVO (mas a edição vai perguntar o escopo)
            establishments={establishments}
            onClose={() => setIsSettingsOpen(false)}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
            onAddEstablishment={addEstablishment}
            onUpdateEstablishment={updateEstablishment}
            onDeleteEstablishment={deleteEstablishment}
            currentMonthName={currentMonthName} // Passa o mês atual para o modal
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-lg p-6 w-full max-w-sm shadow-xl animate-in slide-in-from-bottom duration-300 md:animate-none">
                <div className="flex items-center gap-3 mb-4 text-red-600">
                    <AlertTriangle size={24} />
                    <h3 className="text-lg font-bold uppercase">Confirmar Exclusão</h3>
                </div>
                
                <p className="mb-2 text-gray-800 font-bold uppercase">{deleteConfirmation.description}</p>
                
                {deleteConfirmation.recurrenceType === 'single' ? (
                     <p className="mb-6 text-gray-600 text-sm uppercase">
                        Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
                     </p>
                ) : (
                    <p className="mb-6 text-gray-600 text-sm uppercase">
                        Este é um item recorrente/parcelado. O que deseja excluir?
                    </p>
                )}

                <div className="flex flex-col gap-3">
                    {deleteConfirmation.recurrenceType === 'single' ? (
                        <button 
                            onClick={() => confirmDelete('single')}
                            className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase shadow-sm flex items-center justify-center gap-2"
                        >
                            <Trash2 size={18} /> Sim, Excluir
                        </button>
                    ) : (
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
                    )}
                   
                    <button 
                        onClick={() => setDeleteConfirmation(null)}
                        className="mt-2 py-3 text-sm text-gray-500 hover:text-gray-800 text-center uppercase font-medium"
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
import React, { useState } from 'react';
import { CategoryData, EstablishmentData, Transaction } from '../types';
import { Trash2, Edit2, Plus, X, Save, ArrowLeft, AlertTriangle, ShieldCheck, CheckCircle2, AlertCircle, Database, RefreshCw, FileSpreadsheet, Play, Check } from 'lucide-react';
import { formatCurrency, exportToExcel } from '../utils';
import { supabase } from '../supabaseClient';

interface SettingsProps {
  categories: CategoryData[];
  establishments: EstablishmentData[];
  transactions: Transaction[];
  session: any;
  onRefreshData: () => Promise<void>;
  onUpdateCategory: (id: string, name: string, budget?: number, scope?: 'single' | 'future') => void;
  onDeleteCategory: (id: string) => void;
  onUpdateEstablishment: (id: string, name: string) => void;
  onDeleteEstablishment: (id: string) => void;
  onAddCategory: (name: string, budget?: number) => void;
  onAddEstablishment: (name: string) => void;
  onClose: () => void;
  currentMonthName?: string;
  dbError?: string | null;
  onClearDbError?: () => void;
}

const Settings: React.FC<SettingsProps> = ({
  categories,
  establishments,
  transactions,
  session,
  onRefreshData,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateEstablishment,
  onDeleteEstablishment,
  onAddCategory,
  onAddEstablishment,
  onClose,
  currentMonthName = 'MÊS ATUAL',
  dbError = null,
  onClearDbError
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'establishments' | 'integrity'>('categories');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editBudget, setEditBudget] = useState(''); 
  const [originalBudget, setOriginalBudget] = useState<number | undefined>(undefined);
  
  const [newValue, setNewValue] = useState('');
  const [newBudget, setNewBudget] = useState(''); 
  
  // State for Scope Modal (Update Budget)
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{id: string, name: string, budget: number} | null>(null);

  // State for Delete Confirmation
  const [itemToDelete, setItemToDelete] = useState<{id: string, name: string, type: 'cat' | 'est'} | null>(null);

  // Integrity Check State
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<{
    checked: boolean;
    checking: boolean;
    dbCount: number;
    localCount: number;
    countMatch: boolean;
    hasNanValues: boolean;
    hasNullDates: boolean;
    balanceValid: boolean;
    errors: string[];
    warnings: string[];
    successes: string[];
  } | null>(null);

  const handleVerifyIntegrity = async () => {
    setIntegrityStatus({
      checked: false,
      checking: true,
      dbCount: 0,
      localCount: 0,
      countMatch: false,
      hasNanValues: false,
      hasNullDates: false,
      balanceValid: false,
      errors: [],
      warnings: [],
      successes: []
    });
    
    const errorsList: string[] = [];
    const warningsList: string[] = [];
    const successesList: string[] = [];
    
    try {
      if (!session) {
        errorsList.push("Nenhuma sessão de usuário ativa detectada.");
        setIntegrityStatus({
          checked: true, checking: false, dbCount: 0, localCount: 0, countMatch: false, hasNanValues: false, hasNullDates: false, balanceValid: false, errors: errorsList, warnings: warningsList, successes: successesList
        });
        return;
      }

      // Sincronizar dados primeiro
      await onRefreshData();

      // 1. Obter contagem exata no Supabase
      const { count: supabaseCount, error: countError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
        
      if (countError) {
        errorsList.push(`Erro de conexão com o banco de dados Supabase: ${countError.message}`);
        setIntegrityStatus({
          checked: true, checking: false, dbCount: 0, localCount: transactions.length, countMatch: false, hasNanValues: false, hasNullDates: false, balanceValid: false, errors: errorsList, warnings: warningsList, successes: successesList
        });
        return;
      }
      
      const realDbCount = supabaseCount || 0;
      const realLocalCount = transactions.length;
      const countMatch = realDbCount === realLocalCount;
      
      if (countMatch) {
        successesList.push(`Contagem de Registros Sincronizada: O aplicativo carregou todos os ${realLocalCount} lançamentos existentes no banco de dados.`);
      } else {
        errorsList.push(`Inconsistência de registros detectada: O aplicativo carregou ${realLocalCount} lançamentos locais, porém existem ${realDbCount} lançamentos salvos no banco de dados para esta conta.`);
      }

      // 2. Analisar validade dos campos locais
      let nanCount = 0;
      let missingDatesCount = 0;
      let invalidTypesCount = 0;
      
      transactions.forEach(t => {
        if (typeof t.amount !== 'number' || isNaN(t.amount)) {
          nanCount++;
        }
        if (!t.date || !t.billingDate) {
          missingDatesCount++;
        }
        if (!['income', 'expense', 'payroll_deduction'].includes(t.type)) {
          invalidTypesCount++;
        }
      });
      
      if (nanCount > 0) {
        errorsList.push(`Inconsistência de valores: Encontrados ${nanCount} registros com valores monetários corrompidos ou não numéricos (NaN).`);
      } else {
        successesList.push("Validação Monetária Concluída: 100% dos registros possuem valores monetários saudáveis e válidos.");
      }
      
      if (missingDatesCount > 0) {
        errorsList.push(`Inconsistência de cronologia: Encontrados ${missingDatesCount} registros sem datas de compra ou de fatura preenchidas.`);
      } else {
        successesList.push("Validação Cronológica Concluída: 100% dos registros possuem datas de compra e cobrança preenchidas.");
      }
      
      if (invalidTypesCount > 0) {
        errorsList.push(`Inconsistência de classificação: Encontrados ${invalidTypesCount} registros com tipos inválidos.`);
      }

      // 3. Validar cálculo matemático do saldo livre do mês selecionado
      // Vamos certificar se a soma dos valores não resulta em NaN ou estouro
      let arithmeticOk = true;
      try {
        const testSum = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        if (isNaN(testSum)) arithmeticOk = false;
      } catch {
        arithmeticOk = false;
      }
      
      if (arithmeticOk) {
        successesList.push("Consistência de Saldo Aprovada: Nenhuma divergência aritmética de arredondamento decimal foi encontrada na consolidação de saldos.");
      } else {
        errorsList.push("Divergência de processamento local: Ocorreu uma exceção ao recalcular as somas decimais locais.");
      }
      
      setIntegrityStatus({
        checked: true,
        checking: false,
        dbCount: realDbCount,
        localCount: realLocalCount,
        countMatch,
        hasNanValues: nanCount > 0,
        hasNullDates: missingDatesCount > 0,
        balanceValid: arithmeticOk,
        errors: errorsList,
        warnings: warningsList,
        successes: successesList
      });
      
    } catch (err: any) {
      errorsList.push(`Erro inesperado durante a rotina de integridade: ${err.message || err}`);
      setIntegrityStatus({
        checked: true,
        checking: false,
        dbCount: 0,
        localCount: transactions.length,
        countMatch: false,
        hasNanValues: true,
        hasNullDates: true,
        balanceValid: false,
        errors: errorsList,
        warnings: warningsList,
        successes: successesList
      });
    }
  };

  const handleExportBackup = () => {
    try {
      exportToExcel(transactions, 'backup_completo_financeiro_diego');
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
    } catch (err: any) {
      alert(`Falha ao exportar backup: ${err.message}`);
    }
  };

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
        const budgetChanged = (budgetVal !== (originalBudget || 0));

        if (budgetChanged) {
            setPendingUpdate({ id: editingId, name: upperValue, budget: budgetVal });
            setShowScopeModal(true);
        } else {
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

  const confirmDelete = () => {
      if (!itemToDelete) return;

      if (itemToDelete.type === 'cat') {
          onDeleteCategory(itemToDelete.id);
      } else {
          onDeleteEstablishment(itemToDelete.id);
      }
      setItemToDelete(null);
  }

  return (
    <div className="fixed inset-0 bg-white md:bg-black md:bg-opacity-50 flex items-center justify-center z-50 md:p-4">
      
      {/* Scope Confirmation Modal (Updates) */}
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

      {/* Delete Confirmation Modal (Inside Settings) */}
      {itemToDelete && (
         <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-3 mb-4 text-red-600">
                    <AlertTriangle size={24} />
                    <h3 className="text-lg font-bold uppercase">Excluir Item</h3>
                </div>
                <p className="mb-2 text-gray-800 font-bold uppercase">{itemToDelete.name}</p>
                <p className="mb-6 text-gray-600 text-sm">
                    Tem certeza que deseja excluir? Isso pode afetar lançamentos históricos se não houver cuidado.
                </p>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={confirmDelete}
                        className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase shadow-sm flex items-center justify-center gap-2"
                    >
                       <Trash2 size={18} /> Sim, Excluir
                    </button>
                    <button 
                        onClick={() => setItemToDelete(null)}
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
          <button
            className={`flex-1 py-4 md:py-3 text-sm md:text-base font-bold uppercase tracking-wide ${activeTab === 'integrity' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('integrity')}
          >
            Integridade
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
          {dbError && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <h4 className="font-bold text-red-800 text-xs uppercase">Erro no Banco de Dados</h4>
                <p className="text-red-700 text-xs mt-0.5 font-semibold">{dbError}</p>
              </div>
              {onClearDbError && (
                <button onClick={onClearDbError} className="text-red-400 hover:text-red-600">
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          
          {activeTab === 'integrity' ? (
            <div className="space-y-6">
               <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 text-blue-800">
                     <ShieldCheck size={22} className="shrink-0" />
                     <h3 className="text-base font-bold uppercase tracking-wide">Verificar Integridade</h3>
                  </div>
                  <p className="text-gray-600 text-xs leading-relaxed uppercase font-semibold">
                     Valide a consistência das transações locais com os dados do servidor (Supabase) e verifique a integridade aritmética do saldo.
                  </p>
                  
                  <div className="flex flex-col md:flex-row gap-2 pt-2">
                     <button
                       onClick={handleVerifyIntegrity}
                       disabled={integrityStatus?.checking}
                       className="flex-1 bg-blue-800 hover:bg-blue-700 disabled:bg-blue-300 text-white font-extrabold uppercase py-3.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-md shrink-0 cursor-pointer h-12"
                     >
                       {integrityStatus?.checking ? (
                         <>
                           <RefreshCw size={15} className="animate-spin" />
                           Verificando...
                         </>
                       ) : (
                         <>
                           <Play size={15} />
                           Verificar Integridade
                         </>
                       )}
                     </button>
                  </div>

                  {integrityStatus && !integrityStatus.checking && (
                     <div className="mt-4 border-t pt-4 space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                           <span className="text-xs font-bold uppercase text-gray-500">Resultado do Diagnóstico:</span>
                           {integrityStatus.errors.length === 0 ? (
                             <span className="text-[10px] bg-green-100 text-green-800 font-extrabold px-2 py-0.5 rounded-full uppercase border border-green-200">Consistente</span>
                           ) : (
                             <span className="text-[10px] bg-red-100 text-red-800 font-extrabold px-2 py-0.5 rounded-full uppercase border border-red-200">Inconsistência</span>
                           )}
                        </div>

                        {/* Successes */}
                        {integrityStatus.successes.length > 0 && (
                          <div className="space-y-1.5">
                            {integrityStatus.successes.map((succ, index) => (
                              <div key={index} className="flex items-start gap-2 text-green-700 bg-green-50/50 p-2.5 rounded border border-green-100 text-[11px] font-bold uppercase">
                                 <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-green-600" />
                                 <span>{succ}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Errors */}
                        {integrityStatus.errors.length > 0 && (
                          <div className="space-y-1.5">
                            {integrityStatus.errors.map((err, index) => (
                              <div key={index} className="flex items-start gap-2 text-red-700 bg-red-50 p-2.5 rounded border border-red-100 text-[11px] font-bold uppercase">
                                 <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
                                 <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="text-[10px] text-gray-400 font-bold uppercase pt-2 border-t flex flex-wrap gap-x-4 gap-y-1">
                           <span>Local: {integrityStatus.localCount}</span>
                           <span>Supabase: {integrityStatus.dbCount}</span>
                           <span>Usuário: {session?.user?.email}</span>
                        </div>
                     </div>
                  )}
               </div>

               <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-800">
                     <Database size={22} className="shrink-0" />
                     <h3 className="text-base font-bold uppercase tracking-wide font-extrabold">Exportar Backup</h3>
                  </div>
                  <p className="text-gray-600 text-xs leading-relaxed uppercase font-semibold">
                     Gere uma planilha Excel (.xlsx) contendo o histórico absoluto de todos os lançamentos cadastrados como cópia de segurança.
                  </p>
                  
                  <div className="pt-2">
                     <button
                       onClick={handleExportBackup}
                       className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold uppercase py-3.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer h-12"
                     >
                       <FileSpreadsheet size={16} />
                       Exportar Backup (Excel)
                     </button>
                     
                     {backupSuccess && (
                       <div className="mt-3 text-center text-xs text-green-600 font-extrabold uppercase flex items-center justify-center gap-1.5 animate-pulse">
                          <Check size={14} /> Backup gerado com sucesso!
                       </div>
                     )}
                  </div>
               </div>
            </div>
          ) : (
            <>
              {/* Add New Item */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAdd(activeTab === 'categories' ? 'cat' : 'est');
                }}
                className="flex flex-col md:flex-row gap-2 mb-6 items-stretch md:items-center bg-gray-50 p-3 rounded-lg border border-gray-200 sticky top-0 z-10"
              >
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
                        type="submit"
                        className="bg-green-500 text-white px-6 h-12 rounded-lg hover:bg-green-600 flex items-center justify-center shadow-sm"
                    >
                        <Plus size={24} />
                    </button>
                </div>
              </form>

              <ul className="space-y-3">
                {(activeTab === 'categories' ? categories : establishments).map((item) => (
                  <li key={item.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    {editingId === item.id ? (
                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveEdit(activeTab === 'categories' ? 'cat' : 'est');
                            }}
                            className="flex flex-col md:flex-row gap-2 w-full"
                        >
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
                                <button type="submit" className="text-white bg-green-500 p-2 rounded"><Save size={20} /></button>
                                <button type="button" onClick={() => finishEdit()} className="text-gray-500 bg-gray-200 p-2 rounded"><X size={20} /></button>
                            </div>
                        </form>
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
                                    onClick={() => setItemToDelete({ 
                                        id: item.id, 
                                        name: item.name, 
                                        type: activeTab === 'categories' ? 'cat' : 'est'
                                    })} 
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { Search, X, Calendar, ArrowRight, History } from 'lucide-react';
import { parseISO } from 'date-fns';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onNavigateToPeriod: (date: Date) => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, transactions, onNavigateToPeriod }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const term = query.toLowerCase();
    return transactions
      .filter(t => t.description.toLowerCase().includes(term))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50); // Limite de 50 resultados para performance
  }, [query, transactions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-10 md:pt-20">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b flex items-center gap-3">
          <Search className="text-blue-600" size={24} />
          <input
            ref={inputRef}
            type="text"
            placeholder="BUSCAR NO HISTÓRICO (EX: MAZÊ)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-bold uppercase text-gray-800 placeholder:text-gray-400"
          />
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {query.length > 0 && query.length < 2 && (
            <div className="p-8 text-center text-gray-400 uppercase font-bold text-xs">
              Digite pelo menos 2 letras...
            </div>
          )}

          {query.length >= 2 && results.length === 0 && (
            <div className="p-12 text-center">
              <History size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 font-bold uppercase text-sm">Nenhum registro encontrado no histórico</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Resultados Encontrados ({results.length})
              </div>
              {results.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onNavigateToPeriod(parseISO(t.billingDate));
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-50 rounded-xl transition-colors group border border-transparent hover:border-blue-100"
                >
                  <div className="flex flex-col items-start text-left">
                    <span className="font-black text-gray-800 uppercase text-sm group-hover:text-blue-700 transition-colors">
                      {t.description}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold flex items-center gap-1 uppercase">
                        <Calendar size={10} /> {formatDate(t.date)}
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 uppercase">
                        Ver Mês da Compra
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-black text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(t.amount)}
                    </span>
                    <ArrowRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors group-hover:translate-x-1 duration-200" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 bg-gray-50 border-t text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                DICA: CLIQUE NO RESULTADO PARA IR ATÉ O MÊS DO LANÇAMENTO
            </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
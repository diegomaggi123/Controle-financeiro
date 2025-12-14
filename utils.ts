
import { v4 as uuidv4 } from 'uuid';
import { format, addMonths, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const generateId = (): string => uuidv4();

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (!isValid(date)) return '';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
};

export const formatDateForInput = (dateStr: string): string => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
}

export const getMonthYearKey = (date: Date): string => {
  return format(date, 'yyyy-MM');
};

export const addMonthsToDate = (dateStr: string, months: number): string => {
  const date = parseISO(dateStr);
  return addMonths(date, months).toISOString();
};

export const getCategoryColor = (categoryName: string): string => {
  const map: Record<string, string> = {
    'Alimentação': 'bg-orange-100 text-orange-700',
    'Transporte': 'bg-blue-100 text-blue-700',
    'Lazer': 'bg-purple-100 text-purple-700',
    'Moradia': 'bg-indigo-100 text-indigo-700',
    'Saúde': 'bg-red-100 text-red-700',
    'Educação': 'bg-yellow-100 text-yellow-800',
    'Vestuário': 'bg-pink-100 text-pink-700',
    'Renda': 'bg-green-100 text-green-700',
    'Outros': 'bg-gray-100 text-gray-700'
  };
  return map[categoryName] || 'bg-gray-100 text-gray-600';
};

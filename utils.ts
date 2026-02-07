import { v4 as uuidv4 } from 'uuid';
import { format, addMonths, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from './types';

export const generateId = (): string => uuidv4();

// Função crucial para evitar erros como 0.1 + 0.2 = 0.30000000004
export const normalizeCurrency = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(normalizeCurrency(value));
};

/**
 * Converte string YYYY-MM-DD para Date local ao meio-dia para evitar shifts de fuso horário
 */
export const parseLocal = (dateStr: string): Date => {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [year, month, day] = cleanDate.split('-').map(Number);
    // Usamos meio-dia (12:00) para garantir que mesmo com shifts leves de fuso o dia não mude
    return new Date(year, month - 1, day, 12, 0, 0);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const date = parseLocal(dateStr);
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  } catch (e) {
    return '';
  }
};

export const formatDateForInput = (dateStr: string): string => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
}

export const getMonthYearKey = (date: Date): string => {
  return format(date, 'yyyy-MM');
};

export const normalizeString = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

export const addMonthsToDate = (dateStr: string, months: number): string => {
  const date = parseLocal(dateStr);
  return format(addMonths(date, months), 'yyyy-MM-dd');
};

export const getCategoryColor = (categoryName: string): string => {
  if (!categoryName) return 'bg-gray-100 text-gray-600';
  
  const upperName = categoryName.toUpperCase();

  const map: Record<string, string> = {
    'ALIMENTAÇÃO': 'bg-orange-100 text-orange-700',
    'TRANSPORTE': 'bg-blue-100 text-blue-700',
    'LAZER': 'bg-purple-100 text-purple-700',
    'MORADIA': 'bg-indigo-100 text-indigo-700',
    'SAÚDE': 'bg-red-100 text-red-700',
    'EDUCAÇÃO': 'bg-yellow-100 text-yellow-800',
    'VESTUÁRIO': 'bg-pink-100 text-pink-700',
    'RENDA': 'bg-green-100 text-green-700',
    'OUTROS': 'bg-gray-100 text-gray-700',
    'DESCONTO EM FOLHA': 'bg-indigo-100 text-indigo-800 font-bold border border-indigo-200'
  };
  return map[upperName] || 'bg-gray-100 text-gray-600';
};

// --- Export Functions ---

export const exportToExcel = (transactions: Transaction[], fileName: string = 'transacoes') => {
  const dataToExport = transactions.map(t => ({
    'Data Compra': formatDate(t.date),
    'Data Fatura': formatDate(t.billingDate),
    'Descrição': t.description,
    'Categoria': t.category,
    'Tipo': t.type === 'income' ? 'Receita' : t.type === 'expense' ? 'Despesa' : 'Desc. Folha',
    'Cartão': t.isCreditCard ? 'SIM' : 'NÃO',
    'Valor': normalizeCurrency(t.amount),
    'Repetição': t.recurrenceType === 'single' ? 'À Vista' : 
                 t.recurrenceType === 'fixed' ? 'Fixo' :
                 t.recurrenceType === 'installment' ? `Parcelado (${t.installmentCurrent}/${t.installmentTotal})` :
                 `Repetir (${t.installmentCurrent}/${t.installmentTotal})`
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transações");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const exportToPDF = (transactions: Transaction[], title: string = 'Relatório Financeiro') => {
  const doc = new jsPDF();
  const tableColumn = ["Data", "Descrição", "Cat", "Forma", "Valor", "Rep"];
  const tableRows: any[] = [];

  transactions.forEach(t => {
    const transactionData = [
      formatDate(t.date),
      t.description,
      t.category,
      t.isCreditCard ? 'Cartão' : (t.type === 'income' ? 'Receita' : 'Outro'),
      formatCurrency(t.amount),
      t.recurrenceType === 'single' ? '-' : 
      t.recurrenceType === 'fixed' ? 'Fixo' : 
      `${t.installmentCurrent}/${t.installmentTotal}`
    ];
    tableRows.push(transactionData);
  });

  doc.text(title, 14, 15);
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 20,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 }
  });
  doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
};
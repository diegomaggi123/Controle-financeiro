
import { v4 as uuidv4 } from 'uuid';
import { format, addMonths, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from './types';

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
  if (!categoryName) return 'bg-gray-100 text-gray-600';
  
  // Normaliza para maiúsculo para comparação
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
    'OUTROS': 'bg-gray-100 text-gray-700'
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
    'Tipo': t.type === 'income' ? 'Receita' : 'Despesa',
    'Valor': t.amount, // Keep as number for Excel math
    'Repetição': t.recurrenceType === 'single' ? 'À Vista' : 
                 t.recurrenceType === 'fixed' ? 'Fixo' :
                 t.recurrenceType === 'installment' ? `Parcelado (${t.installmentCurrent}/${t.installmentTotal})` :
                 `Repetir (${t.installmentCurrent}/${t.installmentTotal})`
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transações");
  
  // Auto-width adjustment (basic)
  const wscols = [
    {wch: 12}, {wch: 12}, {wch: 30}, {wch: 20}, {wch: 10}, {wch: 15}, {wch: 20}
  ];
  worksheet['!cols'] = wscols;

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const exportToPDF = (transactions: Transaction[], title: string = 'Relatório Financeiro') => {
  const doc = new jsPDF();

  const tableColumn = ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Detalhes"];
  const tableRows: any[] = [];

  transactions.forEach(t => {
    const transactionData = [
      formatDate(t.date),
      t.description,
      t.category,
      t.type === 'income' ? 'Receita' : 'Despesa',
      formatCurrency(t.amount),
      t.recurrenceType === 'single' ? '-' : 
      t.recurrenceType === 'fixed' ? 'Fixo' : 
      `${t.installmentCurrent}/${t.installmentTotal}`
    ];
    tableRows.push(transactionData);
  });

  doc.text(title, 14, 15);
  
  // Calculate Totals
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;

  doc.setFontSize(10);
  doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);
  doc.text(`Receitas: ${formatCurrency(income)}  |  Despesas: ${formatCurrency(expense)}  |  Saldo: ${formatCurrency(balance)}`, 14, 28);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 64, 175] }, // Blue-800 matches app theme
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
};
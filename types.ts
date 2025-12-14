export type TransactionType = 'income' | 'expense';

export type RecurrenceType = 'single' | 'installment' | 'fixed' | 'repeat';

export interface Transaction {
  id: string;
  groupId: string; // To link installments or fixed series
  description: string; // Establishment / Name
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // ISO Date String (The actual purchase date)
  billingDate: string; // ISO Date String (The date it counts towards budget)
  recurrenceType: RecurrenceType;
  installmentCurrent?: number;
  installmentTotal?: number;
}

export interface CategoryData {
  id: string;
  name: string;
  budget?: number; // Orçamento padrão
}

export interface MonthlyBudget {
  id: string;
  category_id: string;
  month_year: string; // 'YYYY-MM'
  amount: number;
}

export interface EstablishmentData {
  id: string;
  name: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  percentage: string;
}

export type UpdateMode = 'single' | 'future' | 'all'; // 'all' not requested but good practice, keeping to 'single' | 'future' based on request
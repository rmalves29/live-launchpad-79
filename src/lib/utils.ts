import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata um valor numérico como moeda brasileira (R$)
 * @param value - Valor numérico a ser formatado
 * @param showSymbol - Se deve exibir o símbolo R$ (padrão: true)
 * @returns String formatada como moeda (ex: "R$ 1.234,56")
 */
export function formatCurrency(value: number | string | null | undefined, showSymbol: boolean = true): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  
  if (isNaN(numValue)) {
    return showSymbol ? 'R$ 0,00' : '0,00';
  }
  
  const formatted = numValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return showSymbol ? `R$ ${formatted}` : formatted;
}

/**
 * Formata um CPF com máscara (XXX.XXX.XXX-XX)
 * @param value - CPF sem formatação
 * @returns CPF formatado
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

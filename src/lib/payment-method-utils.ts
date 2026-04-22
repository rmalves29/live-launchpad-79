// Utilitário central para exibição da forma de pagamento do pedido.
// O valor cru salvo em orders.payment_method é normalizado por este módulo
// para um rótulo amigável em PT-BR (PIX, Cartão de Crédito, Boleto, etc).

export type PaymentMethodInfo = {
  raw: string | null | undefined;
  label: string;
  installments?: number | null;
};

const LABEL_MAP: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  creditcard: 'Cartão de Crédito',
  credit: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  debitcard: 'Cartão de Débito',
  debit: 'Cartão de Débito',
  boleto: 'Boleto',
  bolbradesco: 'Boleto',
  ticket: 'Boleto',
  account_money: 'Saldo Mercado Pago',
  bank_transfer: 'Transferência Bancária',
  voucher: 'Vale',
  other: 'Outro',
  infinitepay: 'InfinitePay',
  infinitepay_pix: 'PIX (InfinitePay)',
  infinitepay_credit: 'Cartão de Crédito (InfinitePay)',
  infinitepay_debit: 'Cartão de Débito (InfinitePay)',
};

export function formatPaymentMethod(
  raw: string | null | undefined,
  installments?: number | null
): PaymentMethodInfo {
  if (!raw) return { raw, label: 'Não informado', installments };
  const key = String(raw).toLowerCase().trim();
  const label = LABEL_MAP[key] || raw;
  return { raw, label, installments };
}

export function formatPaymentMethodWithInstallments(
  raw: string | null | undefined,
  installments?: number | null
): string {
  const info = formatPaymentMethod(raw, installments);
  if (info.installments && info.installments > 1) {
    return `${info.label} - ${info.installments}x`;
  }
  return info.label;
}

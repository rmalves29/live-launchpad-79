/** Regras do @ (Instagram/TikTok) usadas na live e no checkout. */

export type HandlePlatform = 'instagram' | 'tiktok';
export type CheckoutLookupType = 'phone' | HandlePlatform;

/** Remove espaços, @ do começo e espaços internos. Não muda maiúsculas. */
export function cleanHandle(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/^@+/, '').replace(/\s+/g, '');
}

/** Escapa curingas do LIKE para que `ilike` faça comparação exata sem diferenciar maiúsculas. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface CheckoutContact {
  phone?: string | null;
  email?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Campos que faltam quando a cliente abriu o checkout pelo @:
 * telefone, e-mail e endereço completo são obrigatórios.
 */
export function missingFieldsForHandleCheckout(c: CheckoutContact): string[] {
  const missing: string[] = [];
  const digits = String(c.phone ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) missing.push('Telefone');
  if (!EMAIL_RE.test(String(c.email ?? '').trim())) missing.push('E-mail');
  if (String(c.cep ?? '').replace(/\D/g, '').length !== 8) missing.push('CEP');
  if (!String(c.street ?? '').trim()) missing.push('Rua');
  if (!String(c.number ?? '').trim()) missing.push('Número');
  if (!String(c.neighborhood ?? '').trim()) missing.push('Bairro');
  if (!String(c.city ?? '').trim()) missing.push('Cidade');
  if (!String(c.state ?? '').trim()) missing.push('Estado');
  return missing;
}

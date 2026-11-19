// Telefones e datas do webhook do WhatsApp (saídas do zapi-webhook na etapa 3 para poderem ser testadas).
// Funções puras: não acessam banco nem WhatsApp.

// Função para obter a data atual no timezone de Brasília (America/Sao_Paulo)
export function getBrasiliaDateISO(): string {
  const now = new Date();
  // Brasília é UTC-3, então subtraímos 3 horas do UTC
  const brasiliaOffset = -3 * 60; // -180 minutos
  const utcOffset = now.getTimezoneOffset(); // minutos de diferença do UTC
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  
  const year = brasiliaTime.getFullYear();
  const month = String(brasiliaTime.getMonth() + 1).padStart(2, '0');
  const day = String(brasiliaTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

export function normalizeDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

export function looksLikeBrazilianPhone(value?: string | null): boolean {
  let digits = normalizeDigits(value);
  if (!digits) return false;
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    digits = digits.slice(2);
  } else if (digits.length > 11) {
    return false;
  }
  if (digits.length < 10 || digits.length > 11) return false;
  const ddd = Number(digits.slice(0, 2));
  return !Number.isNaN(ddd) && ddd >= 11 && ddd <= 99;
}

export function firstValidPhone(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (looksLikeBrazilianPhone(value)) return value || '';
  }
  return '';
}

export function normalizeParticipantPhone(value?: string | null): string {
  const digits = normalizeDigits(value);

  if (!digits) return '';

  // Telefones BR reais têm 10-11 dígitos sem DDI e 12-13 com DDI.
  // Identificadores maiores costumam ser LIDs do WhatsApp e não devem ser truncados.
  if (digits.length > 13) {
    return digits;
  }

  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits.slice(2);
  }

  return digits;
}

export function hashMessage(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';

  // Remove all non-digit characters
  let clean = phone.replace(/\D/g, '');

  // IDs de grupo e LIDs do WhatsApp não são telefones reais.
  if (clean.length > 13) return '';

  // Remove country code 55 if present
  if (clean.startsWith('55') && clean.length > 11) {
    clean = clean.substring(2);
  }

  if (clean.length > 11) return '';

  // Expect DDD + number
  if (clean.length < 10) return '';

  const ddd = Number(clean.substring(0, 2));
  if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) return '';

  // If WhatsApp sends DDD + 8 digits (10 total), assume mobile and add the 9th digit
  // (landlines typically don't use WhatsApp).
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }

  return clean;
}

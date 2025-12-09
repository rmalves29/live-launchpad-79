export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  let clean = String(phone).replace(/\D/g, '');

  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }

  // Aplicar regra do 9º dígito baseada no DDD:
  // - Se DDD < 31: incluir o 9º dígito caso não exista (passar de 10 → 11)
  // - Se DDD >= 31: remover o 9º dígito caso exista (passar de 11 → 10)
  if (clean.length === 10) {
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (!isNaN(ddd) && ddd < 31) {
      // incluir 9
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
    }
    // se DDD >= 31 e tem 10 dígitos, mantemos como está (não inserir o 9)
  } else if (clean.length === 11) {
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (!isNaN(ddd) && ddd >= 31 && clean[2] === '9') {
      // remover 9
      clean = clean.substring(0, 2) + clean.substring(3);
    }
  }

  return clean;
}

export function normalizeForWhatsApp(phone: string): string {
  const storage = normalizeForStorage(phone) || '';
  // Prefixar DDI 55 para envio (sem sufixo @s.whatsapp.net — o servidor faz o sufixo)
  return '55' + storage;
}

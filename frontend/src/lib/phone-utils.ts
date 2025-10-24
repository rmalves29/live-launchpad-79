/**
 * Utilitários para normalização de números de telefone
 * 
 * Armazenamento: DDD + número (sem DDI 55)
 * Envio: DDI 55 + DDD + número
 */

/**
 * Normaliza número para armazenamento no banco (sem DDI, SEMPRE com 11 dígitos).
 * Garante que o número SEMPRE tenha o 9º dígito para armazenamento consistente.
 * 
 * Entrada: 5531992904210 ou (31) 9290-4210 ou 3192904210
 * Saída: 31992904210 (sempre 11 dígitos com 9º dígito)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Se tem 10 dígitos, adiciona o 9º dígito
  if (clean.length === 10) {
    const ddd = clean.substring(0, 2);
    const number = clean.substring(2);
    clean = ddd + '9' + number;
    console.log('✅ 9º dígito ADICIONADO para armazenamento:', phone, '→', clean);
  }
  
  return clean;
}

/**
 * Adiciona DDI 55 para envio via WhatsApp e ajusta 9º dígito baseado no DDD.
 * USADO APENAS NO MOMENTO DO ENVIO (server1.js).
 * 
 * Regra do 9º dígito para envio:
 * - DDD ≤ 11 (Norte/Nordeste): Se tiver 10 dígitos → ADICIONA o 9º dígito
 * - DDD ≥ 31 (Sudeste/Sul/Centro-Oeste): Se tiver 11 dígitos → REMOVE o 9º dígito
 * 
 * Exemplos:
 * - 1192904210 (DDD 11, 10 dígitos) → 5511992904210 (adiciona 9)
 * - 31992904210 (DDD 31, 11 dígitos) → 55319290421 (remove o 9º dígito)
 * - 67999583003 (DDD 67, 11 dígitos) → 556799583003 (remove primeiro 9)
 */
export function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se já presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Validação básica de tamanho
  if (clean.length < 10 || clean.length > 11) {
    console.warn('⚠️ Telefone com tamanho inválido:', phone);
    return '55' + clean;
  }
  
  // Extrai o DDD
  const ddd = parseInt(clean.substring(0, 2));
  
  // Validar DDD
  if (ddd < 11 || ddd > 99) {
    console.warn('⚠️ DDD inválido:', ddd);
    return '55' + clean;
  }
  
  // Aplica regra do 9º dígito APENAS PARA ENVIO
  if (ddd <= 11) {
    // Norte/Nordeste: Se tem 10 dígitos, ADICIONA o 9º dígito
    if (clean.length === 10) {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('📤 9º dígito ADICIONADO para envio (DDD ≤ 11):', phone, '→', clean);
    }
  } else if (ddd >= 31) {
    // Sudeste/Sul/Centro-Oeste: Se tem 11 dígitos e começa com 9, REMOVE o 9º dígito
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log('📤 9º dígito REMOVIDO para envio (DDD ≥ 31):', phone, '→', clean);
    }
  }
  
  // Adiciona DDI 55
  return '55' + clean;
}

/**
 * Formata número de telefone para exibição
 * Exibe exatamente como está armazenado no banco
 * 
 * Entrada: 3192904210 ou 31992904210
 * Saída: (31) 9290-4210 ou (31) 99290-4210
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove DDI se presente para formatação
  const phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  if (phoneWithoutDDI.length >= 10) {
    const ddd = phoneWithoutDDI.substring(0, 2);
    const number = phoneWithoutDDI.substring(2);
    
    if (number.length === 9) {
      // Celular: (31) 99999-9999
      return `(${ddd}) ${number.substring(0, 5)}-${number.substring(5)}`;
    } else if (number.length === 8) {
      // Fixo: (31) 9999-9999
      return `(${ddd}) ${number.substring(0, 4)}-${number.substring(4)}`;
    }
  }
  
  return phone;
}
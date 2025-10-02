/**
 * Utilitários para normalização de números de telefone
 * 
 * Armazenamento: DDD + número (sem DDI 55)
 * Envio: DDI 55 + DDD + número
 */

/**
 * Normaliza número para armazenamento no banco (sem DDI).
 * Armazena EXATAMENTE como digitado, sem ajustar 9º dígito.
 * 
 * Entrada: 5531992904210 ou 3193786530 ou (31) 99290-4210
 * Saída: 31992904210 ou 3193786530 (como digitado)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  return clean;
}

/**
 * Adiciona DDI 55 e ajusta 9º dígito para envio WhatsApp.
 * APENAS para uso no Node.js antes de enviar mensagens!
 * 
 * Regra do 9º dígito:
 * - DDD ≤ 30: Celular precisa ter 9º dígito (11 dígitos total)
 * - DDD ≥ 31: Celular NÃO deve ter 9º dígito (10 dígitos total)
 * 
 * Entrada: 31992904210 ou 3193786530 ou 5531992904210
 * Saída: 5531992904210 ou 553193786530 (ajustado para WhatsApp)
 */
export function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Validação básica
  if (clean.length < 10 || clean.length > 11) {
    console.warn('⚠️ Telefone com tamanho inválido para envio:', phone);
    return '55' + clean;
  }
  
  const ddd = parseInt(clean.substring(0, 2));
  
  // Validar DDD
  if (ddd < 11 || ddd > 99) {
    console.warn('⚠️ DDD inválido:', ddd);
    return '55' + clean;
  }
  
  // REGRA POR DDD para envio WhatsApp:
  if (ddd <= 30) {
    // DDDs antigos (≤30): adicionar 9º dígito se não tiver
    if (clean.length === 10 && clean[2] !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('✅ 9º dígito adicionado para envio WhatsApp (DDD ≤30):', phone, '->', clean);
    }
  } else {
    // DDDs novos (≥31): remover 9º dígito se tiver
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log('✅ 9º dígito removido para envio WhatsApp (DDD ≥31):', phone, '->', clean);
    }
  }
  
  // Adicionar DDI 55
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
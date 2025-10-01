/**
 * Utilitários para normalização de números de telefone
 * 
 * Armazenamento: DDD + número (sem DDI 55)
 * Envio: DDI 55 + DDD + número
 */

/**
 * Normaliza número para armazenamento no banco (sem DDI).
 * Garante que números mobile brasileiros tenham o 9º dígito.
 * 
 * Entrada: 5531992904210 ou 3193786530 ou (31) 99290-4210
 * Saída: 31993786530 (com 9º dígito garantido)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Validação básica de comprimento
  if (clean.length < 10 || clean.length > 11) {
    console.warn('⚠️ Telefone com comprimento inválido:', clean);
    return clean;
  }
  
  // Validar DDD (11-99)
  const ddd = parseInt(clean.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    console.warn('⚠️ DDD inválido:', ddd);
    return clean;
  }
  
  // REGRA CORRETA: Adicionar 9º dígito se tiver 10 dígitos e não começar com 9
  if (clean.length === 10) {
    const firstDigit = clean[2];
    if (firstDigit !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('✅ 9º dígito adicionado para armazenamento:', phone, '->', clean);
    }
  }
  
  return clean;
}

/**
 * Adiciona DDI 55 ao número e garante o 9º dígito para envio WhatsApp.
 * REGRA: Celulares brasileiros SEMPRE precisam do 9º dígito!
 * 
 * Entrada: 31993786530 ou 3193786530 ou 5531993786530
 * Saída: 5531993786530 (com DDI e 9º dígito garantidos)
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
  
  // REGRA CORRETA: Adicionar 9º dígito se tiver 10 dígitos e não começar com 9
  if (clean.length === 10) {
    const firstDigit = clean[2];
    if (firstDigit !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('✅ 9º dígito adicionado para envio:', phone, '->', clean);
    }
  }
  
  // Adicionar DDI 55
  return '55' + clean;
}

/**
 * Formata número de telefone para exibição
 * Entrada: 31992904210
 * Saída: (31) 99290-4210
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
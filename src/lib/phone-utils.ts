/**
 * Utilitários para normalização de números de telefone
 * 
 * Armazenamento: DDD + número (sem DDI 55)
 * Envio: DDI 55 + DDD + número
 */

/**
 * Normaliza número para armazenamento no banco (sem DDI)
 * Entrada: 5531992904210 ou 31992904210 ou 31 99290-4210
 * Saída: 31992904210 (DDD + número com/sem 9º dígito baseado no DDD)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  let phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  // Deve ter pelo menos 10 dígitos (DDD + 8 dígitos mínimo)
  if (phoneWithoutDDI.length < 10) {
    return phoneWithoutDDI; // Retorna como está se muito pequeno
  }
  
  const ddd = parseInt(phoneWithoutDDI.substring(0, 2));
  const restOfNumber = phoneWithoutDDI.substring(2);
  
  // Normalização do 9º dígito baseado no DDD
  if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
    // DDD < 31: adiciona 9 se não tiver e tiver 8 dígitos
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + '9' + phoneWithoutDDI.substring(2);
  } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
    // DDD >= 31: remove 9 se tiver e tiver 9 dígitos
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + phoneWithoutDDI.substring(3);
  }
  
  return phoneWithoutDDI;
}

/**
 * Normaliza número para envio de mensagens (com DDI)
 * Entrada: 31992904210 ou 5531992904210
 * Saída: 5531992904210 (DDI 55 + DDD + número com/sem 9º dígito baseado no DDD)
 */
export function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Adiciona DDI 55 se não tiver
  let normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  if (normalizedPhone.length >= 4) {
    const ddd = parseInt(normalizedPhone.substring(2, 4));
    const restOfNumber = normalizedPhone.substring(4);
    
    // Normalização do 9º dígito baseado no DDD
    if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
      // DDD < 31: adiciona 9 se não tiver e tiver 8 dígitos
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
      // DDD >= 31: remove 9 se tiver e tiver 9 dígitos
      normalizedPhone = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
    }
  }
  
  return normalizedPhone;
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
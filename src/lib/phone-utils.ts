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
  
  // Validação: deve ter entre 10 e 11 dígitos após remoção do DDI
  if (phoneWithoutDDI.length < 10 || phoneWithoutDDI.length > 11) {
    console.warn(`Número de telefone inválido (${phoneWithoutDDI.length} dígitos): ${phone} -> ${phoneWithoutDDI}`);
    return phone; // Retorna original se inválido para depuração
  }
  
  // Validar se DDD é válido (11-99)
  const ddd = parseInt(phoneWithoutDDI.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    console.warn(`DDD inválido: ${ddd} no número ${phone}`);
    return phone; // Retorna original se DDD inválido
  }
  
  const restOfNumber = phoneWithoutDDI.substring(2);
  
  // Normalização do 9º dígito: todos os celulares brasileiros têm 9 dígitos (incluindo o 9º dígito)
  // Se tiver 8 dígitos após o DDD e não começar com 9, provavelmente é telefone fixo
  // Se tiver 8 dígitos após o DDD e começar com número diferente de 9, adicionar o 9
  if (restOfNumber.length === 8 && !restOfNumber.startsWith('9')) {
    // Número com 8 dígitos sem o 9: adicionar o 9 (celular antigo)
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + '9' + phoneWithoutDDI.substring(2);
  }
  // Se já tem 9 dígitos e começa com 9, está correto - não fazer nada
  
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
    
    // Normalização do 9º dígito: todos os celulares brasileiros têm 9 dígitos
    if (restOfNumber.length === 8 && !restOfNumber.startsWith('9')) {
      // Número com 8 dígitos sem o 9: adicionar o 9 (celular antigo)
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    }
    // Se já tem 9 dígitos e começa com 9, está correto - não fazer nada
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
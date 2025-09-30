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
 * Saída: 31993786530 (com 9º dígito adicionado automaticamente se necessário)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  let phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  // Validação básica de comprimento
  if (phoneWithoutDDI.length < 10 || phoneWithoutDDI.length > 11) {
    console.warn('Telefone com comprimento inválido:', phoneWithoutDDI);
    return phoneWithoutDDI;
  }
  
  // Validar DDD (11-99)
  const ddd = parseInt(phoneWithoutDDI.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    console.warn('DDD inválido:', ddd);
    return phoneWithoutDDI;
  }
  
  // Se tem 11 dígitos, já está correto
  if (phoneWithoutDDI.length === 11) {
    return phoneWithoutDDI;
  }
  
  // Se tem 10 dígitos, adicionar o 9º dígito para celulares
  if (phoneWithoutDDI.length === 10) {
    const firstDigitAfterDDD = phoneWithoutDDI[2];
    
    // Se não começa com 9, adicionar o 9 (celular brasileiro)
    if (firstDigitAfterDDD !== '9') {
      phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + '9' + phoneWithoutDDI.substring(2);
      console.log('✅ 9º dígito adicionado:', phone, '->', phoneWithoutDDI);
    }
  }
  
  return phoneWithoutDDI;
}

/**
 * Adiciona DDI 55 ao número e garante o 9º dígito para envio.
 * 
 * Entrada: 31993786530 ou 3193786530 ou 5531993786530
 * Saída: 5531993786530 (com DDI e 9º dígito garantidos)
 */
export function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove DDI se presente para processar
  const withoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  // Normalizar adicionando 9º dígito se necessário
  let normalized = withoutDDI;
  
  if (withoutDDI.length === 10) {
    const firstDigitAfterDDD = withoutDDI[2];
    
    // Se não começa com 9, adicionar
    if (firstDigitAfterDDD !== '9') {
      normalized = withoutDDI.substring(0, 2) + '9' + withoutDDI.substring(2);
      console.log('✅ 9º dígito adicionado para envio:', phone, '->', normalized);
    }
  }
  
  // Adicionar DDI 55
  return '55' + normalized;
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
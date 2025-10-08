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
 * Adiciona DDI 55 e garante que celulares tenham o 9º dígito.
 * 
 * Regra do 9º dígito no Brasil:
 * - TODOS os celulares devem ter 9 dígitos após o DDD (total 11 dígitos sem DDI)
 * - Celulares começam com 9 após o DDD
 * - Se tiver 10 dígitos e começar com 9, adiciona outro 9 no início
 * 
 * Entrada: 31992904210 ou 3192904210 ou 5531992904210
 * Saída: 5531992904210 (sempre com 9º dígito para celulares)
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
  
  // Garantir 9º dígito para celulares
  // Se tem 10 dígitos e o 3º dígito é '9', significa que é celular mas falta o 9º dígito
  // Exemplo: 3192904210 -> deve virar 31992904210
  if (clean.length === 10 && clean[2] === '9') {
    // É um celular (começa com 9) mas tem apenas 10 dígitos - adicionar o 9º dígito
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
    console.log('✅ 9º dígito adicionado para celular:', phone, '->', clean);
  } else if (clean.length === 10 && clean[2] !== '9') {
    // Número com 10 dígitos que não começa com 9 - pode ser fixo ou celular sem nenhum 9
    // Assumir que é celular e adicionar o 9
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
    console.log('✅ 9º dígito adicionado (não começava com 9):', phone, '->', clean);
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
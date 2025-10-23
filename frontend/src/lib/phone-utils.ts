/**
 * Utilitários para normalização de números de telefone
 * 
 * Armazenamento: DDD + número (sem DDI 55)
 * Envio: DDI 55 + DDD + número
 */

/**
 * Normaliza número para armazenamento no banco (sem DDI).
 * Remove apenas formatação e DDI 55, mantém o número EXATAMENTE como digitado.
 * 
 * Entrada: 5531992904210 ou (31) 99290-4210 ou 67999583003
 * Saída: 31992904210 ou 67999583003 (sem DDI, sem formatação)
 */
export function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Retorna exatamente como está, sem adicionar ou remover dígitos
  return clean;
}

/**
 * Adiciona DDI 55 para envio via WhatsApp e ajusta 9º dígito baseado no DDD.
 * 
 * Regra do 9º dígito:
 * - DDD ≤ 11 (Norte/Nordeste): Se tiver 10 dígitos → ADICIONA o 9º dígito
 * - DDD ≥ 31 (Sudeste/Sul/Centro-Oeste): Se tiver 11 dígitos → REMOVE o 9º dígito
 * 
 * Exemplos:
 * - 1192904210 (DDD 11, 10 dígitos) → 5511992904210 (adiciona 9)
 * - 67999583003 (DDD 67, 11 dígitos) → 556799583003 (remove primeiro 9)
 * - 3192904210 (DDD 31, 10 dígitos) → 5531992904210 (mantém)
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
  
  // Aplica regra do 9º dígito
  if (ddd <= 11) {
    // Norte/Nordeste: Se tem 10 dígitos, ADICIONA o 9º dígito
    if (clean.length === 10) {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('✅ 9º dígito ADICIONADO (DDD ≤ 11):', phone, '→', clean);
    }
  } else if (ddd >= 31) {
    // Sudeste/Sul/Centro-Oeste: Se tem 11 dígitos e começa com 9, REMOVE o 9º dígito
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log('✅ 9º dígito REMOVIDO (DDD ≥ 31):', phone, '→', clean);
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
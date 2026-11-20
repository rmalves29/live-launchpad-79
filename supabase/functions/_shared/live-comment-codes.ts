// Leitura do código de produto num comentário de live / grupo de WhatsApp — é o que decide se o comentário vira pedido.
// Saiu de dentro do zapi-webhook na etapa 4.2 (código movido sem mudar a lógica) para ter teste próprio.
//
// Formatos aceitos: C76126x2, C76126 x2, 2xC76126, 2x C76126, C76126X2, C76126 (qtd 1),
// variantes com "/" ou "-" (C370/24, C014-1, T002-01) e prefixo de 1 a 3 letras (C, T, P, SKU...).

/**
 * Mensagens de DIVULGAÇÃO de produto (SendFlow) mencionam o código no texto informativo
 * (ex.: "📱 Para comprar, digite apenas o código: C890"). Se ecoarem no grupo, não podem virar pedido.
 */
export function isProductBroadcastMessage(messageText: string): boolean {
  return /🛍️/.test(messageText)
    && /(para\s+(comprar|adquirir)[^\n]{0,40}(digite|responda)|digite\s+apenas\s+o\s+c[oó]digo)/i.test(messageText);
}

export function extractProductEntries(messageText: string): Array<{ code: string; qty: number }> {
  const productEntries: Array<{ code: string; qty: number }> = [];

  // Pattern 1: code first, then optional quantity — C76126x2, T002-01x2, C370/24 x2
  const codeFirstRegex = /\b([A-Za-z]{1,3})(\d{1,6}(?:[\/\-]\d{1,3})?)\s*[xX]\s*(\d{1,3})\b/g;
  // Pattern 2: quantity first, then code — 2xC76126, 2xT002-01
  const qtyFirstRegex = /\b(\d{1,3})\s*[xX]\s*([A-Za-z]{1,3})(\d{1,6}(?:[\/\-]\d{1,3})?)\b/g;
  // Pattern 3: plain code without quantity — C76126, T002-01, C370/24
  const plainCodeRegex = /\b([A-Za-z]{1,3})(\d{1,6}(?:[\/\-]\d{1,3})?)/g;

  const processedCodes = new Set<string>();
  let match;

  // First pass: "C76126x2" / "T002-01x2" style
  while ((match = codeFirstRegex.exec(messageText)) !== null) {
    const normalized = `${match[1].toUpperCase()}${match[2]}`;
    const qty = Math.max(1, Math.min(parseInt(match[3], 10), 99));
    if (!processedCodes.has(normalized)) {
      processedCodes.add(normalized);
      productEntries.push({ code: normalized, qty });
    }
  }

  // Second pass: "2xC76126" / "2xT002-01" style
  while ((match = qtyFirstRegex.exec(messageText)) !== null) {
    const normalized = `${match[2].toUpperCase()}${match[3]}`;
    const qty = Math.max(1, Math.min(parseInt(match[1], 10), 99));
    if (!processedCodes.has(normalized)) {
      processedCodes.add(normalized);
      productEntries.push({ code: normalized, qty });
    }
  }

  // Third pass: plain "C76126" / "T002-01" (only if not already matched with quantity)
  // Prefer the longer/more specific match: if "C370/24" was captured, don't also add "C370".
  const plainMatches: string[] = [];
  while ((match = plainCodeRegex.exec(messageText)) !== null) {
    plainMatches.push(`${match[1].toUpperCase()}${match[2]}`);
  }
  // Sort by length DESC so variants come first (T002-01 before T002)
  plainMatches.sort((a, b) => b.length - a.length);
  for (const normalized of plainMatches) {
    // Skip if a more specific variant of this code was already added
    const hasMoreSpecific = Array.from(processedCodes).some(
      (c) => c !== normalized && c.startsWith(normalized) && (c[normalized.length] === '/' || c[normalized.length] === '-'),
    );
    if (!processedCodes.has(normalized) && !hasMoreSpecific) {
      processedCodes.add(normalized);
      productEntries.push({ code: normalized, qty: 1 });
    }
  }

  return productEntries;
}

// Cópia LITERAL do trecho do zapi-webhook ANTES da etapa 4.2 (referência para o teste de equivalência).
// Não usar em produção.
export function lerComentarioAntigo(messageText: string): { isBroadcastMessage: boolean; productEntries: Array<{ code: string; qty: number }> } {
  const senderPhone = '';
  const console = { log: (..._a: unknown[]) => {} };
    const isBroadcastMessage = /🛍️/.test(messageText)
      && /(para\s+(comprar|adquirir)[^\n]{0,40}(digite|responda)|digite\s+apenas\s+o\s+c[oó]digo)/i.test(messageText);

    // Recognize product codes with optional quantity:
    // Formats: C76126x2, C76126 x2, 2xC76126, 2x C76126, C76126X2, etc.
    // Also plain: C76126 (qty=1)
    // Supports variants with "/" or "-": C370/24, C014-1
    const productEntries: Array<{ code: string; qty: number }> = [];

    if (isBroadcastMessage) {
      console.log(`[zapi-webhook] ⏭️ SKIPPED: mensagem parece ser uma divulgação de produto (SendFlow), não um pedido. From: ${senderPhone}`);
    } else {

    // Code suffix capture: digits, optionally followed by /NN or -NN (variants like /24, -1, T002-01)
    // Accepts 1-3 letter prefix (C, T, P, SKU...) followed by digits and optional variant suffix.
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
        c => c !== normalized && c.startsWith(normalized) && (c[normalized.length] === '/' || c[normalized.length] === '-')
      );
      if (!processedCodes.has(normalized) && !hasMoreSpecific) {
        processedCodes.add(normalized);
        productEntries.push({ code: normalized, qty: 1 });
      }
    }

    } // fim do else (!isBroadcastMessage)

  return { isBroadcastMessage, productEntries };
}

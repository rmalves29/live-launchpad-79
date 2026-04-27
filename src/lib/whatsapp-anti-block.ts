/**
 * Anti-Block Helper (Client-side)
 * Aplica variações sutis em mensagens de cobrança em massa para reduzir
 * a chance de o WhatsApp filtrar/segurar a entrega por detectar conteúdo
 * idêntico enviado em volume.
 *
 * Estratégias:
 *  - Inserção de zero-width space em posição aleatória
 *  - Troca aleatória de emojis equivalentes
 *  - Variação leve de pontuação final
 */

const EMOJI_VARIATIONS: Record<string, string[]> = {
  '✅': ['☑️', '✔️', '👍'],
  '🎉': ['🥳', '✨', '🎊'],
  '🛒': ['🛍️', '📦', '🧺'],
  '💰': ['💵', '💲', '💸'],
  '❌': ['🚫', '⛔', '✖️'],
  '📦': ['🎁', '📬', '🗳️'],
  '🙏': ['🤝', '💚', '✨'],
};

/**
 * Gera variação sutil da mensagem para evitar detecção de spam por similaridade.
 * Mantém o significado e a aparência da mensagem.
 */
export function addMessageVariation(message: string): string {
  let result = message;

  // 30% chance: trocar UM emoji por equivalente
  if (Math.random() < 0.30) {
    for (const [original, alternatives] of Object.entries(EMOJI_VARIATIONS)) {
      if (result.includes(original) && Math.random() < 0.5) {
        const replacement = alternatives[Math.floor(Math.random() * alternatives.length)];
        result = result.replace(original, replacement);
        break; // só uma troca por mensagem
      }
    }
  }

  // 70% chance: inserir zero-width space em posição aleatória (invisível)
  if (Math.random() < 0.70 && result.length > 5) {
    const pos = Math.floor(Math.random() * (result.length - 2)) + 1;
    result = result.slice(0, pos) + '\u200B' + result.slice(pos);
  }

  return result;
}

/**
 * Gera atraso humano aleatório (em ms) dentro de uma faixa, com jitter.
 */
export function getHumanizedDelayMs(baseSeconds: number): number {
  const jitter = Math.random() * 0.6 + 0.7; // 0.7x a 1.3x
  return Math.round(baseSeconds * 1000 * jitter);
}

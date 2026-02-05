/**
 * Anti-Block Delay Helper v2.0
 * Sistema avançado de proteção contra bloqueio do WhatsApp
 * 
 * Estratégias implementadas:
 * 1. Delays aleatórios entre mensagens (5-15 segundos para automáticas)
 * 2. Variações dinâmicas no texto para evitar mensagens idênticas
 * 3. Throttling para múltiplas mensagens ao mesmo número
 * 4. Rate limiting por tenant
 */

// Delay ranges in milliseconds
const FAST_MIN_DELAY_MS = 3000;   // 3 seconds
const FAST_MAX_DELAY_MS = 8000;   // 8 seconds
const LIVE_MIN_DELAY_MS = 8000;   // 8 seconds  
const LIVE_MAX_DELAY_MS = 20000;  // 20 seconds
const THROTTLE_MIN_MS = 15000;    // 15 seconds extra
const THROTTLE_MAX_MS = 45000;    // 45 seconds extra

// In-memory cache for tracking recent messages (resets on function cold start)
const recentMessages: Map<string, number[]> = new Map();
const MESSAGE_WINDOW_MS = 120000; // 2 minute window for throttling

/**
 * Generates a random delay between min and max milliseconds
 */
export function getRandomDelay(
  minMs: number = FAST_MIN_DELAY_MS,
  maxMs: number = FAST_MAX_DELAY_MS
): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Standard anti-block delay (3-8 seconds)
 * Use for: batch operations, less critical messages
 */
export async function antiBlockDelay(
  minMs: number = FAST_MIN_DELAY_MS,
  maxMs: number = FAST_MAX_DELAY_MS
): Promise<number> {
  const delay = getRandomDelay(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, delay));
  return delay;
}

/**
 * Extended anti-block delay for live/automatic messages (8-20 seconds)
 * Use for: item_added, paid_order, tracking - messages triggered by user actions
 */
export async function antiBlockDelayLive(
  minMs: number = LIVE_MIN_DELAY_MS,
  maxMs: number = LIVE_MAX_DELAY_MS
): Promise<number> {
  const delay = getRandomDelay(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, delay));
  return delay;
}

/**
 * Check if phone has received messages recently and return extra throttle delay
 * This prevents sending multiple messages to the same phone in quick succession
 */
export async function getThrottleDelay(phone: string): Promise<number> {
  const now = Date.now();
  const phoneKey = phone.replace(/\D/g, '');
  
  // Get recent messages for this phone
  const timestamps = recentMessages.get(phoneKey) || [];
  
  // Clean old entries
  const recentOnly = timestamps.filter(ts => now - ts < MESSAGE_WINDOW_MS);
  
  // If there are recent messages, apply throttle
  if (recentOnly.length > 0) {
    const delay = getRandomDelay(THROTTLE_MIN_MS, THROTTLE_MAX_MS);
    // Record this message attempt
    recentOnly.push(now);
    recentMessages.set(phoneKey, recentOnly);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }
  
  // Record this message
  recentMessages.set(phoneKey, [now]);
  return 0;
}

/**
 * Logs the delay for debugging purposes
 */
export function logAntiBlockDelay(functionName: string, delayMs: number): void {
  console.log(`[${functionName}] 🛡️ Anti-block delay: ${(delayMs / 1000).toFixed(1)}s`);
}

// Emoji variations for different contexts
const EMOJI_VARIATIONS: Record<string, string[]> = {
  '✅': ['☑️', '✔️', '👍', '💚'],
  '🎉': ['🥳', '✨', '🎊', '💫'],
  '🛒': ['🛍️', '📦', '🛍', '🧺'],
  '💰': ['💵', '💲', '💸', '🤑'],
  '❌': ['🚫', '⛔', '✖️', '🔴'],
  '📦': ['🎁', '📬', '📭', '🗳️'],
};

// Greeting variations
const GREETINGS = ['Olá!', 'Oi!', 'Ei!', 'Oie!', 'Opa!', ''];

// Suffix variations
const SUFFIXES = ['✨', '💫', '!!', '! ✨', '🎉', ' ✔️', ''];

/**
 * Adds subtle variations to message to avoid identical messages
 * This helps prevent automated message detection by WhatsApp
 */
export function addMessageVariation(message: string): string {
  let result = message;
  
  // 25% chance: Add random greeting at start
  if (Math.random() < 0.25 && !result.match(/^(olá|oi|ei|opa|oie)/i)) {
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    if (greeting) {
      result = greeting + '\n\n' + result;
    }
  }
  
  // 30% chance: Swap emojis with alternatives
  if (Math.random() < 0.30) {
    for (const [original, alternatives] of Object.entries(EMOJI_VARIATIONS)) {
      if (result.includes(original) && Math.random() < 0.5) {
        const replacement = alternatives[Math.floor(Math.random() * alternatives.length)];
        result = result.replace(original, replacement);
        break; // Only replace one emoji per message
      }
    }
  }
  
  // 20% chance: Add/adjust spacing
  if (Math.random() < 0.20) {
    // Add extra line break somewhere
    result = result.replace(/\n\n/g, '\n\n\n');
  }
  
  // 15% chance: Add random suffix at end
  if (Math.random() < 0.15) {
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    if (suffix && !result.endsWith('✨') && !result.endsWith('💫')) {
      result = result.trimEnd() + ' ' + suffix;
    }
  }
  
  // 10% chance: Add invisible variation (zero-width space)
  if (Math.random() < 0.10) {
    const pos = Math.floor(Math.random() * result.length);
    result = result.slice(0, pos) + '\u200B' + result.slice(pos);
  }
  
  return result;
}

/**
 * Check rate limit for tenant (max messages per minute)
 * Returns true if should proceed, false if rate limited
 */
const tenantMessageCounts: Map<string, { count: number; resetAt: number }> = new Map();
const MAX_MESSAGES_PER_MINUTE = 15;

export function checkTenantRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = tenantMessageCounts.get(tenantId);
  
  if (!entry || now > entry.resetAt) {
    // Reset counter
    tenantMessageCounts.set(tenantId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (entry.count >= MAX_MESSAGES_PER_MINUTE) {
    console.log(`[rate-limit] Tenant ${tenantId} exceeded ${MAX_MESSAGES_PER_MINUTE} msgs/min`);
    return false;
  }
  
  entry.count++;
  return true;
}

/**
 * Get a human-like typing delay based on message length
 * Longer messages = longer "typing" time
 */
export function getTypingDelay(messageLength: number): number {
  // Average human types ~40 chars per second
  const baseTime = (messageLength / 40) * 1000;
  // Add some randomness (0.5x to 1.5x)
  const multiplier = 0.5 + Math.random();
  return Math.min(Math.max(baseTime * multiplier, 1000), 8000); // 1-8 seconds
}

/**
 * NOTE: Z-API does NOT support sending typing indicators (COMPOSING status)
 * The /typing endpoint does not exist. Z-API only provides a webhook to RECEIVE
 * typing status from other users, not to SEND it.
 * 
 * This function now only adds a human-like delay before sending messages,
 * without calling any Z-API endpoint.
 * 
 * @param _instanceId Z-API instance ID (unused)
 * @param _token Z-API token (unused)
 * @param _clientToken Z-API client token (unused)
 * @param phone Target phone number (for logging)
 * @param durationSeconds Delay duration (default 3-5s random)
 * @returns Promise that resolves after delay
 */
export async function simulateTyping(
  _instanceId: string,
  _token: string,
  _clientToken: string | null | undefined,
  phone: string,
  durationSeconds?: number
): Promise<void> {
  // Default duration: random 3-5 seconds
  const duration = durationSeconds ?? (3 + Math.floor(Math.random() * 3));
  
  // Z-API does not support sending typing indicators
  // We just add a human-like delay to make messages feel more natural
  const waitMs = duration * 1000 + Math.random() * 1000;
  console.log(`[simulateTyping] ⏱️ Human-like delay for ${phone}: ${(waitMs/1000).toFixed(1)}s (Note: Z-API does not support typing indicators)`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

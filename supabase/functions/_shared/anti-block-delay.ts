/**
 * Anti-Block Delay Helper
 * Simulates human-like behavior by adding random delays before sending WhatsApp messages.
 * This helps prevent WhatsApp from flagging the account as automated/spam.
 */

// Default delay range in milliseconds
const DEFAULT_MIN_DELAY_MS = 2000; // 2 seconds
const DEFAULT_MAX_DELAY_MS = 8000; // 8 seconds

/**
 * Generates a random delay between min and max milliseconds
 */
export function getRandomDelay(
  minMs: number = DEFAULT_MIN_DELAY_MS,
  maxMs: number = DEFAULT_MAX_DELAY_MS
): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Sleeps for a random amount of time to simulate human behavior
 * Returns the actual delay used (useful for logging)
 */
export async function antiBlockDelay(
  minMs: number = DEFAULT_MIN_DELAY_MS,
  maxMs: number = DEFAULT_MAX_DELAY_MS
): Promise<number> {
  const delay = getRandomDelay(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, delay));
  return delay;
}

/**
 * Logs the delay for debugging purposes
 */
export function logAntiBlockDelay(functionName: string, delayMs: number): void {
  console.log(`[${functionName}] 🛡️ Anti-block delay: ${(delayMs / 1000).toFixed(1)}s`);
}

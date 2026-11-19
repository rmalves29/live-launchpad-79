// Funções puras do envio de pedidos ao Bling (saídas do bling-sync-orders na etapa 3 para poderem ser testadas).
// Nada aqui acessa o banco: só formata, valida e chama a API do Bling com nova tentativa.
// deno-lint-ignore-file no-explicit-any

// Helper to delay between requests (Bling limit: 3 req/second)
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Normaliza UF: converte nome do estado (ex: "São Paulo", "Goias") para sigla de 2 letras (ex: "SP", "GO")
export const UF_MAP: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
};

export function normalizeUF(state: string | null | undefined): string {
  if (!state) return '';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return UF_MAP[key] || trimmed.toUpperCase().slice(0, 2);
}

export type BlingFetchResult = {
  response: Response;
  text: string;
};

/**
 * Bling has a strict rate limit (commonly 3 req/sec) and may return 429.
 * This helper retries with exponential backoff (and honors Retry-After when present).
 */
export async function blingFetchWithRetry(
  url: string,
  options: RequestInit,
  cfg: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<BlingFetchResult> {
  const maxAttempts = cfg.maxAttempts ?? 5;
  const baseDelayMs = cfg.baseDelayMs ?? 700;
  const label = cfg.label ?? url;

  let lastResponse: Response | null = null;
  let lastText = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    const text = await res.text();
    lastResponse = res;
    lastText = text;

    if (res.status !== 429 && res.status !== 502 && res.status !== 503) {
      return { response: res, text };
    }

    // Retry
    if (attempt < maxAttempts) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))
        ? Number(retryAfterHeader) * 1000
        : null;

      const backoffMs = Math.round(baseDelayMs * Math.pow(1.8, attempt - 1));
      const waitMs = retryAfterMs ?? backoffMs;
      console.log(`[bling-sync-orders] Rate/Transient error (${res.status}) on ${label}. Attempt ${attempt}/${maxAttempts}. Waiting ${waitMs}ms...`);
      await delay(waitMs);
      continue;
    }

    return { response: res, text };
  }

  // Shouldn't reach here, but keep types happy
  if (!lastResponse) {
    throw new Error('Failed to call Bling API (no response)');
  }
  return { response: lastResponse, text: lastText };
}

/**
 * Validate CPF using checksum algorithm
 */
export function isValidCPF(cpf: string): boolean {
  const cleanCpf = cpf.replace(/\D/g, '');
  
  if (cleanCpf.length !== 11) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCpf.charAt(9))) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCpf.charAt(10))) return false;
  
  return true;
}

export function isDuplicateNumeroError(payloadText: string): boolean {
  // Bling validation error: code 36 -> duplicate "numero" for sales order
  return (
    payloadText.includes('"code":36') &&
    payloadText.includes('"element":"numero"') &&
    payloadText.includes('VENDAS')
  );
}

export function isInsufficientStockError(payloadText: string): boolean {
  // Bling validation error: code 67 -> stock integration blocked by insufficient balance
  return (
    payloadText.includes('"code":67') ||
    /saldo de um ou mais produtos (?:é|\u00e9) insuficiente/i.test(payloadText) ||
    /N(?:ão|\u00e3o) (?:é|\u00e9) poss(?:í|\u00ed)vel integrar o estoque/i.test(payloadText)
  );
}

/**
 * Update an existing Bling contact's address data.
 * When `force=true`, uses a longer timeout and skips any short-circuit logic
 * (this is used as the automatic retry path when the first attempt fails).
 */
/** Devolve o e-mail limpo se tiver formato válido; senão devolve vazio (nunca manda lixo para o Bling). */
export function validEmailOrEmpty(value: unknown): string {
  const email = String(value ?? '').trim();
  if (!email || email.length > 120) return '';
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]{2,}$/.test(email) ? email : '';
}

// Normaliza telefone BR para o formato aceito pelo Bling: (XX) XXXXX-XXXX
// Remove prefixo internacional 55 e zeros à esquerda (ex.: 011981543237 -> (11) 98154-3237)
export function formatBlingPhone(raw: string | null | undefined): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return ''; // inválido: melhor omitir do que quebrar a validação do Bling
}

export function normalizeShippingText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stripFrenetPrefix(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\s*Frenet\s*[-–]\s*/i, '')
    .trim();
}

export function normalizeFrenetServiceLabel(value: string | null | undefined): string {
  const service = stripFrenetPrefix(value)
    .replace(/^\s*Correios\s*[-–]\s*/i, '')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();
  const normalized = normalizeShippingText(service);

  if (/\bsedex\b/.test(normalized)) return 'SEDEX';
  if (/\bpac\b/.test(normalized)) return 'PAC';
  if (/\bmini\s*envios?\b/.test(normalized) || /\bpac\s*mini\b/.test(normalized)) return 'Mini Envios';

  return service || '';
}

export function inferFrenetCarrierName(freteNome: string, servicoFrete: string): string {
  const normalized = normalizeShippingText(`${freteNome} ${servicoFrete}`);
  const carrierMap: Array<[RegExp, string]> = [
    [/\b(sedex|pac|mini envios?|correios)\b/, 'Correios'],
    [/\bjadlog\b/, 'Jadlog'],
    [/\bloggi\b/, 'Loggi'],
    [/\bkangu\b/, 'Kangu'],
    [/\bjamef\b/, 'Jamef'],
    [/\btotal express\b/, 'Total Express'],
    [/\bazul\b/, 'Azul Cargo'],
    [/\blatam\b/, 'LATAM Cargo'],
    [/\bbraspress\b/, 'Braspress'],
    [/\brodonaves\b/, 'RTE Rodonaves'],
    [/\bsequoia\b/, 'Sequoia'],
  ];

  for (const [pattern, carrier] of carrierMap) {
    if (pattern.test(normalized)) return carrier;
  }

  return 'Transportadora Frenet';
}

export function getFrenetServiceCodeCandidate(shippingServiceId: unknown): string {
  if (shippingServiceId === null || shippingServiceId === undefined || shippingServiceId === '') return '';
  const raw = String(shippingServiceId).trim();
  if (!raw) return '';
  return /^\d+$/.test(raw) && raw.length < 5 ? raw.padStart(5, '0') : raw;
}

export function getLogisticServiceMatchFields(service: any): string[] {
  const aliases = Array.isArray(service?.aliases) ? service.aliases : [];
  return [
    service?.descricao,
    service?.codigo,
    service?.idCodigoServico,
    ...aliases,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export function matchesLogisticService(service: any, candidateKeys: Set<string>): boolean {
  const fields = getLogisticServiceMatchFields(service).map(normalizeShippingText).filter(Boolean);
  return fields.some((field) => {
    if (candidateKeys.has(field)) return true;
    for (const candidate of candidateKeys) {
      if (candidate && (field.includes(candidate) || candidate.includes(field))) return true;
    }
    return false;
  });
}

export function chooseLogisticServiceAlias(service: any, candidateKeys: Set<string>): string {
  const aliases = Array.isArray(service?.aliases)
    ? service.aliases.map((alias: unknown) => String(alias || '').trim()).filter(Boolean)
    : [];

  const matchingAlias = aliases.find((alias: string) => candidateKeys.has(normalizeShippingText(alias)));
  return matchingAlias || aliases[0] || String(service?.codigo || service?.descricao || '').trim();
}

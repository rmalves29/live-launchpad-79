// Referência de afiliado (first-click): o primeiro código vale por 60 dias.
const KEY = 'cz_ref';
const DAYS = 60;

function readCookie(): string | null {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${KEY}=`));
    return m ? decodeURIComponent(m.slice(KEY.length + 1)) : null;
  } catch { return null; }
}

export function getActiveRef(now = Date.now()): string | null {
  // localStorage primeiro; sem ele (navegador de app, modo privado) vale o cookie gravado junto
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* sem armazenamento */ }
  if (!raw) raw = readCookie();
  if (!raw) return null;
  try {
    const { codigo, at } = JSON.parse(raw);
    if (!codigo || !at || now - Number(at) > DAYS * 864e5) return null;
    return String(codigo);
  } catch { return null; }
}

/** Grava o código só se não houver outro ativo (primeiro afiliado vale). */
export function rememberRef(codigo: string, now = Date.now()): string {
  const active = getActiveRef(now);
  if (active) return active;
  const value = JSON.stringify({ codigo, at: now });
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
  document.cookie = `${KEY}=${encodeURIComponent(value)}; max-age=${DAYS * 86400}; path=/; SameSite=Lax`;
  return codigo;
}

export function whatsappText(affiliate: { nome: string; codigo: string } | null): string {
  return affiliate
    ? `Oi! Quero conhecer o Cartzy. Vim pela indicação de ${affiliate.nome} (cód. ${affiliate.codigo})`
    : 'Oi! Quero conhecer o Cartzy.';
}

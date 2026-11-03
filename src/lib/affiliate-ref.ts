// Referência de afiliado (first-click): o primeiro código vale por 60 dias.
const KEY = 'cz_ref';
const DAYS = 60;

export function getActiveRef(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
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

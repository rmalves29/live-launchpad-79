export function affiliateCodeFromName(nome: string): string {
  const first = (nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().split(/\s+/)[0] || "";
  const c = first.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);
  return c.length >= 2 ? c : "PARCEIRO";
}

export function normalizePhone(p: string): string {
  let d = (p || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.slice(0, 15);
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

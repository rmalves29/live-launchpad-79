// Regras puras da contratação direta (testadas em rules_test.ts).

export const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function isValidCpf(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[len])) return false;
  }
  return true;
}

export function isValidCnpj(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const isValidDocument = (v: string) => isValidCpf(v) || isValidCnpj(v);

/** Mesmo formato do banco (platform_norm_whatsapp): DDI 55 e nono dígito em celular. */
export function whatsappKey(v: unknown): string | null {
  let d = onlyDigits(v);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return "55" + d;
}

export const normInstagram = (v: unknown) =>
  String(v ?? "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 60);

export const isValidEmail = (v: string) => /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]{2,}$/.test(v);

export const MIN_FILL_MS = 4000;
/** Anti-bot: honeypot preenchido ou formulário enviado rápido demais. */
export function looksLikeBot(honeypot: unknown, startedAt: unknown, now = Date.now()): boolean {
  if (String(honeypot ?? "").trim() !== "") return true;
  const t = Number(startedAt);
  return !Number.isFinite(t) || now - t < MIN_FILL_MS;
}

export const SIGNUP_PLANS = ["live", "grupos_vip"] as const;
export type SignupPlan = typeof SIGNUP_PLANS[number];
export const planFlags = (p: SignupPlan) =>
  p === "grupos_vip"
    ? { enable_live: false, enable_loja_live: false, enable_sendflow: true, access_scope: "fluxo_envio" as string | null }
    : { enable_live: true, enable_loja_live: true, enable_sendflow: false, access_scope: null as string | null };

export function welcomeSelfSignup(contato: string, empresa: string, email: string, link: string): string {
  return `Olá, ${contato.split(" ")[0] || ""}! 👋 Pagamento confirmado — seja bem-vinda ao Cartzy!

A conta da *${empresa}* já está ativa.

🌐 Site: https://app.cartzy.com.br
👤 Login: ${email}
🔑 Senha: a que você criou no cadastro

📅 Agende sua reunião de onboarding (30 min) para configurarmos pagamento, frete e ERP:
${link}`;
}

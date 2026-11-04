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

export const SIGNUP_PLANS = ["live", "grupos_vip", "completo"] as const;
export type SignupPlan = typeof SIGNUP_PLANS[number];
export const PLAN_LABELS: Record<SignupPlan, string> = {
  live: "Sistema de Live",
  grupos_vip: "Sistema de Grupos WhatsApp",
  completo: "Combo Live + Grupos WhatsApp",
};
export const parsePlan = (v: unknown): SignupPlan =>
  (SIGNUP_PLANS as readonly string[]).includes(String(v)) ? v as SignupPlan : "live";

/** Preço mensal de cada opção: sistemas avulsos usam plan_price e o combo usa combo_price. */
export function planPrice(p: SignupPlan, cfg: { plan_price?: unknown; combo_price?: unknown } | null | undefined): number {
  const n = (v: unknown, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  return p === "completo" ? n(cfg?.combo_price, 499) : n(cfg?.plan_price, 299);
}
export const planPrices = (cfg: { plan_price?: unknown; combo_price?: unknown } | null | undefined) =>
  Object.fromEntries(SIGNUP_PLANS.map((p) => [p, planPrice(p, cfg)])) as Record<SignupPlan, number>;

export const planFlags = (p: SignupPlan) =>
  p === "grupos_vip"
    ? { enable_live: false, enable_loja_live: false, enable_sendflow: true, access_scope: "fluxo_envio" as string | null }
    : p === "completo"
      ? { enable_live: true, enable_loja_live: true, enable_sendflow: true, access_scope: null as string | null }
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

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Aviso ao dono quando uma contratação direta é paga. */
export function newCompanyAlert(d: {
  empresa: string; responsavel: string; whatsapp: string; email: string; documento: string; instagram: string;
  plano: string; valor: number; afiliada: string; onboarding: string | null;
}): string {
  return `🎉 *Nova empresa no Cartzy!*

🏪 ${d.empresa}
👤 ${d.responsavel}
📱 ${d.whatsapp}
✉️ ${d.email}
🧾 ${d.documento}${d.instagram ? `\n📸 @${d.instagram}` : ""}

📦 Plano: ${d.plano} — ${brl(d.valor)}/mês
🤝 Indicação: ${d.afiliada}

📅 Onboarding: ${d.onboarding ? `${d.onboarding} (Brasília)` : "ainda não agendado — avisamos quando a cliente marcar"}`;
}

/** Aviso ao dono quando a cliente marca o onboarding. */
export function onboardingAlert(d: { empresa: string; quando: string; whatsapp: string; email: string; link: string | null }): string {
  return `📅 *Onboarding agendado*

🏪 ${d.empresa}
🕒 ${d.quando} (Brasília) · 30 min
📱 ${d.whatsapp}
✉️ ${d.email}${d.link ? `\n🔗 ${d.link}` : "\n(Google Agenda não conectado: reunião salva sem link do Meet)"}`;
}

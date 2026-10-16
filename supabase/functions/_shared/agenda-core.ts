// Regras puras da agenda do site (sem rede, sem banco) — fáceis de testar.
// Grade, antecedência, janela de dias úteis, limite diário e conflitos.
// Fuso: horário de Brasília. O Brasil não tem horário de verão desde 2019, então o
// deslocamento é fixo (-03:00) e configurável em agenda_config.fuso_offset.

export interface Grade {
  dias: number[]; // 0=dom ... 6=sáb
  janelas: [number, number][]; // minutos desde 00:00 local, ex.: [[540,720],[840,1140]]
  duracao: number; // min
  intervalo: number; // min
  antecedencia: number; // min
  janelaDiasUteis: number;
  limiteDia: number;
  limiteSemana: number; // semana seg–dom
  horizonteDias: number; // até quantos dias à frente procurar quando os próximos estiverem lotados
  feriados: Set<string>; // "YYYY-MM-DD"
  offsetMin: number; // -180
}

export interface Ocupado {
  inicio: Date;
  duracao: number;
}

export interface Horario {
  inicio: string;
  hora: string;
}
export interface Dia {
  data: string;
  rotulo: string;
  horarios: Horario[];
}

export const GRADE_PADRAO = {
  grade_dias: "1,2,3,4,5",
  grade_janelas: "09:00-12:00,14:00-19:00",
  duracao_min: "30",
  intervalo_min: "15",
  antecedencia_min_horas: "2",
  janela_dias_uteis: "3",
  limite_dia: "3",
  limite_semana: "12",
  horizonte_dias: "7",
  feriados: "",
  fuso_offset: "-03:00",
};

const hm = (s: string) => {
  const [h, m] = s.trim().split(":").map(Number);
  return h * 60 + (m || 0);
};

export function parseOffset(s: string): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s.trim());
  if (!m) return -180;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}

export function gradeDeConfig(cfg: Record<string, string | undefined>): Grade {
  const g = (k: keyof typeof GRADE_PADRAO) => (cfg[k] ?? "").trim() || GRADE_PADRAO[k];
  const num = (k: keyof typeof GRADE_PADRAO, min: number, max: number) => {
    const n = Number(g(k));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : Number(GRADE_PADRAO[k]);
  };
  const janelas = g("grade_janelas")
    .split(",")
    .map((j) => j.split("-"))
    .filter((p) => p.length === 2)
    .map(([a, b]) => [hm(a), hm(b)] as [number, number])
    .filter(([a, b]) => b > a);
  return {
    dias: g("grade_dias").split(",").map(Number).filter((n) => n >= 0 && n <= 6),
    janelas,
    duracao: num("duracao_min", 10, 180),
    intervalo: num("intervalo_min", 0, 120),
    antecedencia: num("antecedencia_min_horas", 0, 72) * 60,
    janelaDiasUteis: num("janela_dias_uteis", 1, 15),
    limiteDia: num("limite_dia", 1, 30),
    limiteSemana: num("limite_semana", 1, 150),
    horizonteDias: num("horizonte_dias", 1, 30),
    feriados: new Set(g("feriados").split(",").map((s) => s.trim()).filter(Boolean)),
    offsetMin: parseOffset(g("fuso_offset")),
  };
}

const z = (n: number) => String(n).padStart(2, "0");
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Partes locais (no fuso da grade) de um instante. */
export function local(d: Date, offsetMin: number) {
  const l = new Date(d.getTime() + offsetMin * 60000);
  return {
    data: `${l.getUTCFullYear()}-${z(l.getUTCMonth() + 1)}-${z(l.getUTCDate())}`,
    dow: l.getUTCDay(),
    minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
    dia: l.getUTCDate(),
    mes: l.getUTCMonth() + 1,
    hora: `${z(l.getUTCHours())}:${z(l.getUTCMinutes())}`,
  };
}

export function offsetStr(offsetMin: number) {
  const s = offsetMin < 0 ? "-" : "+";
  const a = Math.abs(offsetMin);
  return `${s}${z(Math.floor(a / 60))}:${z(a % 60)}`;
}

/** Instante de "data local + minutos". */
function instante(data: string, minutos: number, offsetMin: number): Date {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0) + minutos * 60000 - offsetMin * 60000);
}

export function rotuloDia(d: Date, offsetMin: number) {
  const p = local(d, offsetMin);
  return `${DIAS_CURTOS[p.dow]}, ${z(p.dia)}/${z(p.mes)}`;
}
export function rotuloDiaLongo(d: Date, offsetMin: number) {
  const p = local(d, offsetMin);
  return `${DIAS_LONGOS[p.dow]}, ${z(p.dia)}/${z(p.mes)}`;
}
export function horaLocal(d: Date, offsetMin: number) {
  return local(d, offsetMin).hora;
}

function conflita(ini: Date, g: Grade, ocupados: Ocupado[]): boolean {
  const s = ini.getTime();
  const fim = s + g.duracao * 60000;
  const folga = g.intervalo * 60000;
  return ocupados.some((o) => {
    const oi = o.inicio.getTime();
    const of = oi + o.duracao * 60000;
    return s < of + folga && fim + folga > oi;
  });
}

/** Segunda-feira (data local) da semana seg–dom de uma data local "YYYY-MM-DD". */
export function segundaDaSemana(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const volta = (t.getUTCDay() + 6) % 7; // seg=0 … dom=6
  t.setUTCDate(t.getUTCDate() - volta);
  return `${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())}`;
}

/**
 * Horários livres.
 * Regra: mostra os primeiros `janelaDiasUteis` dias úteis QUE TÊM horário livre, procurando de hoje até
 * `horizonteDias` dias à frente. Dia lotado (limite diário), semana lotada (limite semanal seg–dom) ou
 * dia sem nenhum horário livre é pulado — por isso, com a semana cheia, aparecem os primeiros horários
 * da semana seguinte. Se nada aparecer no horizonte, a lista volta vazia e o site oferece o WhatsApp.
 * `ocupados` = reuniões 'agendada' (qualquer origem) + períodos ocupados do Google (freebusy).
 * `porDia` = reuniões 'agendada' por data local (conta para os limites diário e semanal).
 */
export function gerarSlots(g: Grade, ocupados: Ocupado[], porDia: Record<string, number>, agora = new Date()): Dia[] {
  const out: Dia[] = [];
  const corte = agora.getTime() + g.antecedencia * 60000;
  const porSemana: Record<string, number> = {};
  for (const [d, n] of Object.entries(porDia)) {
    const s = segundaDaSemana(d);
    porSemana[s] = (porSemana[s] ?? 0) + n;
  }
  let data = local(agora, g.offsetMin).data;
  for (let i = 0; i <= g.horizonteDias && out.length < g.janelaDiasUteis; i++) {
    const meiaNoite = instante(data, 0, g.offsetMin);
    const dow = local(meiaNoite, g.offsetMin).dow;
    const diaCheio = (porDia[data] ?? 0) >= g.limiteDia;
    const semanaCheia = (porSemana[segundaDaSemana(data)] ?? 0) >= g.limiteSemana;
    if (g.dias.includes(dow) && !g.feriados.has(data) && !diaCheio && !semanaCheia) {
      const horarios: Horario[] = [];
      for (const [a, b] of g.janelas) {
        for (let t = a; t + g.duracao <= b; t += g.duracao + g.intervalo) {
          const c = instante(data, t, g.offsetMin);
          if (c.getTime() < corte || conflita(c, g, ocupados)) continue;
          const hora = local(c, g.offsetMin).hora;
          horarios.push({ inicio: `${data}T${hora}:00${offsetStr(g.offsetMin)}`, hora });
        }
      }
      if (horarios.length > 0) out.push({ data, rotulo: rotuloDia(meiaNoite, g.offsetMin), horarios });
    }
    data = local(new Date(meiaNoite.getTime() + 36 * 3600000), g.offsetMin).data; // próximo dia
  }
  return out;
}

export function slotValido(dias: Dia[], inicio: Date): boolean {
  const t = inicio.getTime();
  return dias.some((d) => d.horarios.some((h) => new Date(h.inicio).getTime() === t));
}

/* ───────────── validação de entrada ───────────── */

export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let d = input.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return "55" + d;
}

export function texto(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // remove caracteres de controle e espaços repetidos
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export const ENUMS = {
  canal_venda: ["grupos", "live", "os_dois"],
  maior_caos: ["postar_grupo", "eu_quero_perdido", "cobrar_pix", "pos_live", "tudo"],
  pedidos_semana: ["ate_30", "30_100", "mais_100", "comecando"],
  quem_atende: ["so_eu", "familia", "fixo"],
} as const;

/** Texto curto da dor, usado no lembrete D-1 e na ficha de quem conduz. */
export const DOR_TEXTO: Record<string, string> = {
  postar_grupo: "postar produto grupo por grupo",
  eu_quero_perdido: "o “eu quero” perdido no grupo ou nos comentários",
  cobrar_pix: "cobrar e conferir PIX",
  pos_live: "o pós-live até de madrugada",
  tudo: "a bagunça dos pedidos",
};
export const ROTULOS: Record<string, string> = {
  grupos: "Grupos de WhatsApp",
  live: "Live",
  os_dois: "Grupos e live",
  ate_30: "Até 30/semana",
  "30_100": "30 a 100/semana",
  mais_100: "Mais de 100/semana",
  comecando: "Ainda começando",
  so_eu: "Só ela",
  familia: "Ela e alguém da família",
  fixo: "Tem alguém fixo",
};

export const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "fbp",
  "fbc",
  "ga_client_id",
  "landing_path",
  "referrer",
] as const;

export function attribution(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const k of ATTR_KEYS) {
    const s = texto((v as Record<string, unknown>)[k], 300);
    if (s) out[k] = s;
  }
  return out;
}

// Agenda de reuniões do programa de afiliados (horário de Brasília, -03:00 fixo, sem horário de verão).
export type Agenda = {
  dias: number[]; // 0=dom ... 6=sáb
  inicio: string; // "09:00"
  fim: string; // "18:00"
  tz: string;
  antecedencia_min: number;
  dias_frente: number;
  duracao: number;
};

export const DEFAULT_AGENDA: Agenda = {
  dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00", tz: "America/Sao_Paulo",
  antecedencia_min: 120, dias_frente: 14, duracao: 30,
};

const BRT_MS = 3 * 3600e3;
const hm = (s: string, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
  return m ? Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2])) : d;
};

export function normalizeAgenda(a: any): Agenda {
  const x = { ...DEFAULT_AGENDA, ...(a && typeof a === "object" ? a : {}) };
  const dias = Array.isArray(x.dias) ? x.dias.map(Number).filter((n: number) => n >= 0 && n <= 6) : DEFAULT_AGENDA.dias;
  return {
    dias: [...new Set<number>(dias)].sort(),
    inicio: x.inicio, fim: x.fim, tz: "America/Sao_Paulo",
    antecedencia_min: Math.max(0, Number(x.antecedencia_min) || 0),
    dias_frente: Math.min(60, Math.max(1, Number(x.dias_frente) || 14)),
    duracao: 30,
  };
}

/** Horários livres (ISO UTC) entre agora+antecedência e agora+dias_frente, sem os já ocupados. */
export function listSlots(agenda: Agenda, now: Date, booked: string[] = []): string[] {
  const a = normalizeAgenda(agenda);
  const taken = new Set(booked.map((b) => new Date(b).toISOString()));
  const min = now.getTime() + a.antecedencia_min * 60e3;
  const start = hm(a.inicio, 540), end = hm(a.fim, 1080);
  const brt = new Date(now.getTime() - BRT_MS);
  const out: string[] = [];
  for (let d = 0; d <= a.dias_frente; d++) {
    const day = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + d));
    if (!a.dias.includes(day.getUTCDay())) continue;
    for (let m = start; m + a.duracao <= end; m += a.duracao) {
      const t = day.getTime() + m * 60e3 + BRT_MS;
      if (t < min) continue;
      const iso = new Date(t).toISOString();
      if (!taken.has(iso)) out.push(iso);
    }
  }
  return out;
}

export function isValidSlot(agenda: Agenda, now: Date, iso: string): boolean {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return false;
  return listSlots(agenda, now).includes(t.toISOString());
}

/** "qua, 05/11 às 14:00" em Brasília */
export function formatBrt(iso: string): string {
  const d = new Date(new Date(iso).getTime() - BRT_MS);
  const wd = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${wd}, ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

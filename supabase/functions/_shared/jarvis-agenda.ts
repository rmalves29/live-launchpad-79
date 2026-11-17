// Agenda da Manuela (Jarvis): janelas por dia da semana, horário de Brasília (-03:00 fixo).
// O dia de hoje fica sempre bloqueado: só aparece de amanhã em diante.
import { busyIntervals, googleConfigured } from "./google-calendar.ts";
import { overlapsBusy } from "./agenda-availability.ts";

export const JARVIS_TENANT_ID = "a7a1e5c0-7a2c-4b6e-9a11-0a1a2b3c4d5e";
export const JARVIS_MINUTES = 30;
const DIAS_FRENTE = 21;
const BRT_MS = 3 * 3600e3;

// 0=dom ... 6=sáb → janelas [início, fim]
export const JARVIS_JANELAS: Record<number, [string, string][]> = {
  1: [["09:00", "11:00"], ["14:00", "17:30"]],
  2: [["09:00", "11:00"], ["14:00", "17:30"]],
  3: [["09:00", "11:00"], ["14:00", "17:30"]],
  4: [["09:00", "11:00"], ["14:00", "17:30"]],
  5: [["09:00", "11:00"], ["14:00", "17:30"]],
  6: [["10:00", "12:00"], ["14:00", "15:30"]],
};

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function jarvisRuleSlots(now: Date, booked: string[] = []): string[] {
  const taken = new Set(booked.map((b) => new Date(b).toISOString()));
  const brt = new Date(now.getTime() - BRT_MS);
  const out: string[] = [];
  for (let d = 1; d <= DIAS_FRENTE; d++) { // d=0 é hoje: sempre bloqueado
    const day = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + d));
    for (const [ini, fim] of JARVIS_JANELAS[day.getUTCDay()] || []) {
      for (let m = toMin(ini); m + JARVIS_MINUTES <= toMin(fim); m += JARVIS_MINUTES) {
        const iso = new Date(day.getTime() + m * 60e3 + BRT_MS).toISOString();
        if (!taken.has(iso)) out.push(iso);
      }
    }
  }
  return out;
}

async function busy(fromIso: string, toIso: string) {
  if (!googleConfigured()) return [];
  try { return await busyIntervals(fromIso, toIso); } catch (e) {
    console.error("[jarvis-agenda] Google freeBusy falhou:", (e as Error).message);
    return [];
  }
}

/** Horários livres: regras − reuniões já marcadas no Cartzy (todas) − compromissos do Google Agenda. */
export async function jarvisSlots(booked: string[], now = new Date()): Promise<string[]> {
  const slots = jarvisRuleSlots(now, booked);
  if (!slots.length) return slots;
  const b = await busy(slots[0], new Date(new Date(slots[slots.length - 1]).getTime() + JARVIS_MINUTES * 60e3).toISOString());
  return b.length ? slots.filter((s) => !overlapsBusy(s, JARVIS_MINUTES, b)) : slots;
}

export async function jarvisSlotFree(iso: string, booked: string[], now = new Date()): Promise<boolean> {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return false;
  const key = t.toISOString();
  if (!jarvisRuleSlots(now, booked).includes(key)) return false;
  const b = await busy(key, new Date(t.getTime() + JARVIS_MINUTES * 60e3).toISOString());
  return !overlapsBusy(key, JARVIS_MINUTES, b);
}

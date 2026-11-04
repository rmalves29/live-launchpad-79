// Horários livres = regras da agenda − reuniões já marcadas no Cartzy − compromissos ocupados no Google Agenda.
import { listSlots, normalizeAgenda, type Agenda } from "./affiliate-agenda.ts";
import { busyIntervals, googleConfigured } from "./google-calendar.ts";

export function overlapsBusy(slotIso: string, minutes: number, busy: { start: string; end: string }[]): boolean {
  const s = new Date(slotIso).getTime(), e = s + minutes * 60e3;
  return busy.some((b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s);
}

async function googleBusy(slots: string[], minutes: number) {
  if (!googleConfigured() || slots.length === 0) return [];
  try {
    const last = new Date(new Date(slots[slots.length - 1]).getTime() + minutes * 60e3).toISOString();
    return await busyIntervals(new Date(slots[0]).toISOString(), last);
  } catch (e) {
    console.error("[agenda] Google freeBusy falhou, usando só as reuniões do Cartzy:", (e as Error).message);
    return [];
  }
}

export async function availableSlots(agenda: Agenda, booked: string[], now = new Date()): Promise<string[]> {
  const a = normalizeAgenda(agenda);
  const slots = listSlots(a, now, booked);
  const busy = await googleBusy(slots, a.duracao);
  return busy.length ? slots.filter((s) => !overlapsBusy(s, a.duracao, busy)) : slots;
}

/** Confere na hora de reservar: horário dentro das regras, sem reunião marcada e livre no Google. */
export async function isSlotFree(agenda: Agenda, iso: string, booked: string[], now = new Date()): Promise<boolean> {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return false;
  const a = normalizeAgenda(agenda);
  const key = t.toISOString();
  if (!listSlots(a, now, booked).includes(key)) return false;
  const busy = await googleBusy([key], a.duracao);
  return !overlapsBusy(key, a.duracao, busy);
}

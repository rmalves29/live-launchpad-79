import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_AGENDA, formatBrt, isValidSlot, listSlots } from "./affiliate-agenda.ts";

// segunda 03/11/2026 08:00 em Brasília = 11:00 UTC
const NOW = new Date("2026-11-03T11:00:00Z");

Deno.test("padrão: seg–sex 09:00–18:00, 30 min, antecedência 2h → primeiro horário 10:00 de hoje", () => {
  const s = listSlots(DEFAULT_AGENDA, NOW);
  assertEquals(s[0], "2026-11-03T13:00:00.000Z"); // 10:00 BRT
  assertEquals(s.filter((x) => x.startsWith("2026-11-04")).length, 18); // 09:00..17:30
});

Deno.test("último horário do dia é 17:30 (termina às 18:00)", () => {
  const day = listSlots(DEFAULT_AGENDA, NOW).filter((x) => x.startsWith("2026-11-04"));
  assertEquals(day[day.length - 1], "2026-11-04T20:30:00.000Z");
});

Deno.test("fim de semana não tem horário", () => {
  assert(!listSlots(DEFAULT_AGENDA, NOW).some((x) => x.startsWith("2026-11-07") || x.startsWith("2026-11-08")));
});

Deno.test("no máximo 14 dias à frente", () => {
  const s = listSlots(DEFAULT_AGENDA, NOW);
  assert(s.every((x) => new Date(x).getTime() <= NOW.getTime() + 15 * 864e5));
  assert(!s.some((x) => x.startsWith("2026-11-18")));
});

Deno.test("horário ocupado some da lista e não é válido fora da grade", () => {
  const taken = "2026-11-04T12:00:00.000Z";
  assert(!listSlots(DEFAULT_AGENDA, NOW, [taken]).includes(taken));
  assert(!isValidSlot(DEFAULT_AGENDA, NOW, "2026-11-04T12:10:00.000Z"));
  assert(!isValidSlot(DEFAULT_AGENDA, NOW, "2026-11-03T12:00:00.000Z")); // 09:00 de hoje, antes da antecedência
});

Deno.test("formata em Brasília", () => {
  assertEquals(formatBrt("2026-11-04T17:00:00.000Z"), "qua, 04/11 às 14:00");
});

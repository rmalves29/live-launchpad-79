import { assertEquals } from "jsr:@std/assert@1";
import { consolidate, normPhone, toCsv, type ConsolidateInput, type Ev } from "./core.ts";

Deno.test("normPhone adiciona 55 para 10/11 dígitos", () => {
  assertEquals(normPhone("(27) 99605-3270"), "5527996053270");
  assertEquals(normPhone("5527996053270@s.whatsapp.net"), "5527996053270");
});

Deno.test("status: no grupo vs saiu e contagens", () => {
  const members = new Map([["5511999990000", new Set(["G1"])]]);
  const r = consolidate({
    members,
    events: [
      { phone: "11999990000", event_type: "join", created_at: "2026-10-01T10:00:00Z", group_jid: "g1", group_id: null, campaign_id: "c1" },
      { phone: "21988880000", event_type: "join", created_at: "2026-10-02T10:00:00Z", group_jid: "g1", group_id: null, campaign_id: null },
      { phone: "21988880000", event_type: "leave", created_at: "2026-10-03T10:00:00Z", group_jid: "g1", group_id: null, campaign_id: null },
    ],
    groupNameByJid: new Map([["g1", "G1"]]), groupNameById: new Map(), campaignName: new Map([["c1", "Camp"]]),
    filters: { status: "saiu" }, eventFilterActive: false,
  });
  assertEquals(r.rows.length, 1);
  assertEquals(r.rows[0][0], "5521988880000");
  assertEquals(r.saiu, 1);
});

Deno.test("CSV usa BOM e ;", () => {
  assertEquals(toCsv(["a", "b"], [["x;y", 1]]), "\uFEFFa;b\r\n\"x;y\";1");
});

const event = (event_type: string, day: string, group_jid = "failed", group_id: string | null = null): Ev => ({
  phone: "11999990000", event_type, created_at: `2026-10-${day}T10:00:00-03:00`, group_jid, group_id, campaign_id: null,
});
const input = (events: Ev[]): ConsolidateInput => ({
  members: new Map(), events, failedGroupJids: new Set(["failed"]),
  groupNameByJid: new Map([["failed", "Grupo com falha"]]), groupNameById: new Map(), campaignName: new Map(),
  filters: {}, eventFilterActive: false,
});

Deno.test("entrada em grupo com falha é não verificado, nunca saiu", () => {
  const result = consolidate(input([event("join", "01")]));
  assertEquals(result.rows[0][1], "não verificado");
  assertEquals(result.nao_verificado, 1);
  assertEquals(result.saiu, 0);
});

Deno.test("presença confirmada em outro grupo prevalece sobre grupo com falha", () => {
  const result = consolidate({ ...input([event("join", "01")]), members: new Map([["5511999990000", new Set(["OK"])]]) });
  assertEquals(result.rows[0][1], "no grupo");
  assertEquals(result.no_grupo, 1);
  assertEquals(result.nao_verificado, 0);
});

Deno.test("saída posterior no mesmo grupo com falha permite classificar saiu", () => {
  const result = consolidate(input([event("leave", "02"), event("join", "01")]));
  assertEquals(result.rows[0][1], "saiu");
  assertEquals(result.nao_verificado, 0);
});

Deno.test("saída de outro grupo não apaga entrada pendente em grupo com falha", () => {
  const result = consolidate(input([event("join", "01"), event("leave", "02", "ok")]));
  assertEquals(result.nao_verificado, 1);
});

Deno.test("status usa histórico completo mesmo com data/campanha filtrada e resolve group_id", () => {
  const join = { ...event("join", "01"), group_jid: null, group_id: "id-failed" };
  const base = { ...input([join]), groupJidById: new Map([["id-failed", "failed"]]), membershipEvents: [join, event("leave", "02")], eventFilterActive: true };
  assertEquals(consolidate(base).rows[0][1], "saiu");
  assertEquals(consolidate({ ...base, membershipEvents: [join], filters: { status: "nao_verificado" } }).nao_verificado, 1);
  assertEquals(consolidate({ ...base, membershipEvents: [join], filters: { status: "saiu" } }).rows.length, 0);
});

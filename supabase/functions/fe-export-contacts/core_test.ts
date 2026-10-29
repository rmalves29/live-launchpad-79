import { assertEquals } from "jsr:@std/assert@1";
import { consolidate, normPhone, toCsv } from "./core.ts";

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

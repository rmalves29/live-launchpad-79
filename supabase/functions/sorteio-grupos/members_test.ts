import { buildPool, drawWinners, normPhone, participantIsAdmin, toMembers } from "./members.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

Deno.test("normaliza telefone", () => {
  eq(normPhone("31999998888"), "5531999998888", "11 dígitos");
  eq(normPhone("5531999998888@s.whatsapp.net"), "5531999998888", "jid");
});

Deno.test("lê participantes UazAPI e Z-API; LID sem número fica de fora", () => {
  const { members, semNumero } = toMembers([
    { JID: "5531911112222@s.whatsapp.net", IsAdmin: true, DisplayName: "Fer" },
    { PhoneNumber: "5531933334444@s.whatsapp.net", JID: "123@lid" },
    { phone: "5511955556666", isAdmin: false },
    { JID: "999@lid" },
  ]);
  eq(members.map((m) => m.phone), ["5531911112222", "5531933334444", "5511955556666"], "telefones");
  eq(semNumero, 1, "sem número");
  eq(participantIsAdmin({ IsSuperAdmin: true }), true, "superadmin");
});

Deno.test("junta grupos sem repetir, tira admins, loja e excluídos", () => {
  const { pool, admins } = buildPool([
    { group: "G1", members: [{ phone: "551111", name: "", admin: true }, { phone: "552222", name: "Ana", admin: false }, { phone: "553333", name: "", admin: false }] },
    { group: "G2", members: [{ phone: "552222", name: "", admin: false }, { phone: "551111", name: "", admin: false }, { phone: "554444", name: "", admin: false }, { phone: "555555", name: "", admin: false }] },
  ], { storePhones: ["554444"], exclude: ["555555"] });
  eq(pool.map((p) => p.phone).sort(), ["552222", "553333"], "pool");
  eq(pool.find((p) => p.phone === "552222")?.groups, ["G1", "G2"], "grupos da Ana");
  eq(admins, 1, "admins");
});

Deno.test("sorteia sem repetir ganhador e cobre todos", () => {
  const pool = [1, 2, 3, 4, 5];
  const w = drawWinners(pool, 5);
  eq(new Set(w).size, 5, "sem repetição");
  eq(drawWinners(pool, 9).length, 5, "limitado ao total");
  const hits = new Map<number, number>();
  for (let i = 0; i < 5000; i++) { const x = drawWinners(pool, 1)[0]; hits.set(x, (hits.get(x) || 0) + 1); }
  for (const v of pool) if ((hits.get(v) || 0) < 800) throw new Error("distribuição desigual");
});

import { applyEvents, phoneVariants } from "./members.ts";
Deno.test("aplica entradas e saídas depois da leitura", () => {
  const base = [{ phone: "553199990000", name: "", admin: false }, { phone: "553188880000", name: "", admin: true }];
  const now = applyEvents(base, [
    { phone: "3199990000", event_type: "leave" },
    { phone: "11947363119", event_type: "join" },
    { phone: "3177770000", event_type: "join" },
    { phone: "3177770000", event_type: "leave" },
  ]);
  eq(now.map((m) => m.phone).sort(), ["5511947363119", "553188880000"], "membros agora");
});
Deno.test("variações do telefone", () => {
  eq(phoneVariants("553195309585").sort(), ["3195309585", "31995309585", "553195309585", "5531995309585"], "com e sem 9");
});

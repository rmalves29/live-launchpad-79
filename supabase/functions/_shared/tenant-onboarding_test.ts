import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOrderZapInstance, isValidSuffix, moduleAccess, onboardingPassword, parseApprovalReply, randomSuffix, samePhone } from "./tenant-onboarding.ts";

const ORDERZAP = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";

Deno.test("resposta aceita apenas a instância da OrderZap (uazapi ou Z-API legado)", () => {
  assert(isOrderZapInstance(`uazapi:${ORDERZAP}`, "old-zapi-id", ORDERZAP));
  assert(isOrderZapInstance("old-zapi-id", "old-zapi-id", ORDERZAP));
  assert(isOrderZapInstance("uazapi:" + ORDERZAP, null, ORDERZAP));
  assert(!isOrderZapInstance(undefined, "old-zapi-id", ORDERZAP));
  assert(!isOrderZapInstance("", "old-zapi-id", ORDERZAP));
  assert(!isOrderZapInstance("outra-instancia", "old-zapi-id", ORDERZAP));
  assert(!isOrderZapInstance(`uazapi:11111111-1111-1111-1111-111111111111`, "old-zapi-id", ORDERZAP));
  assert(!isOrderZapInstance("old-zapi-id", null, ORDERZAP));
});

Deno.test("senha = slug + 2 especiais do conjunto * + @ # $ %", () => {
  for (let i = 0; i < 50; i++) assert(isValidSuffix(randomSuffix()));
  assertEquals(onboardingPassword("grizimodas", "@#"), "grizimodas@#");
  assert(!isValidSuffix("@!"));
});

Deno.test("resposta OK/NÃO/NAO com código de 4 dígitos", () => {
  assertEquals(parseApprovalReply("ok 1234"), { action: "approve", code: "1234" });
  assertEquals(parseApprovalReply("NÃO 0042"), { action: "cancel", code: "0042" });
  assertEquals(parseApprovalReply("nao 0042"), { action: "cancel", code: "0042" });
  assertEquals(parseApprovalReply("ok 123"), null);
  assertEquals(parseApprovalReply("ok 1234 obrigado"), null);
});

Deno.test("aprovador: normaliza DDI 55 e nono dígito", () => {
  assert(samePhone("5531988744756", "3188744756"));
  assert(samePhone("553188744756@s.whatsapp.net", "31988744756"));
  assert(!samePhone("5531988744757", "31988744756"));
});

Deno.test("acessos por live/bazar", () => {
  assertEquals(moduleAccess(true, false).flags, { enable_live: true, enable_loja_live: true, enable_sendflow: false });
  assertEquals(moduleAccess(false, true), { flags: { enable_live: false, enable_loja_live: false, enable_sendflow: true }, access_scope: "fluxo_envio" });
  assertEquals(moduleAccess(true, true).flags.enable_sendflow, true);
  assertEquals(moduleAccess(true, true).access_scope, null);
});

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isValidCnpj, isValidCpf, looksLikeBot, normInstagram, parsePlan, planFlags, planPrice, welcomeSelfSignup, whatsappKey } from "./rules.ts";

Deno.test("CPF e CNPJ válidos/ inválidos", () => {
  assert(isValidCpf("529.982.247-25"));
  assert(!isValidCpf("111.111.111-11"));
  assert(isValidCnpj("11.222.333/0001-81"));
  assert(!isValidCnpj("11.222.333/0001-80"));
});

Deno.test("WhatsApp normalizado com 55 e nono dígito", () => {
  assertEquals(whatsappKey("(11) 9999-8888"), "5511999998888");
  assertEquals(whatsappKey("+55 11 99999-8888"), "5511999998888");
  assertEquals(whatsappKey("123"), null);
});

Deno.test("Instagram sem @ e sem URL", () => {
  assertEquals(normInstagram("https://instagram.com/Loja.X/"), "loja.x");
  assertEquals(normInstagram("@LojaX"), "lojax");
});

Deno.test("anti-bot: honeypot e tempo mínimo de 4s", () => {
  const now = 100_000;
  assert(looksLikeBot("spam", now - 10_000, now));
  assert(looksLikeBot("", now - 3_000, now));
  assert(!looksLikeBot("", now - 5_000, now));
  // isca completada pelo preenchimento automático numa pessoa que levou mais de 30 s
  assert(!looksLikeBot("https://minhaloja.com", now - 90_000, now));
});

Deno.test("plano Grupos VIP só libera Fluxo de Envio", () => {
  assertEquals(planFlags("grupos_vip").enable_live, false);
  assertEquals(planFlags("grupos_vip").access_scope, "fluxo_envio");
  assertEquals(planFlags("live").enable_live, true);
});

Deno.test("boas-vindas não contém senha", () => {
  const m = welcomeSelfSignup("Ana Souza", "Loja", "a@b.com", "https://x/y");
  assert(m.includes("a que você criou"));
  assert(m.includes("https://x/y"));
});

Deno.test("combo: libera live e grupos, preço próprio", () => {
  assertEquals(planFlags("completo").enable_live, true);
  assertEquals(planFlags("completo").enable_sendflow, true);
  assertEquals(planFlags("completo").access_scope, null);
  assertEquals(planPrice("completo", { plan_price: 299, combo_price: 499 }), 499);
  assertEquals(planPrice("grupos_vip", { plan_price: 299, combo_price: 499 }), 299);
  assertEquals(planPrice("completo", null), 499);
  assertEquals(parsePlan("xyz"), "live");
  assertEquals(parsePlan("completo"), "completo");
});

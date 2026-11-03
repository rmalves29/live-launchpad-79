import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { affiliateCodeFromName, normalizePhone } from "./rules.ts";

Deno.test("código do afiliado é o primeiro nome em maiúsculas sem acento", () => {
  assertEquals(affiliateCodeFromName("Juliana Souza"), "JULIANA");
  assertEquals(affiliateCodeFromName("  Ângela  "), "ANGELA");
  assertEquals(affiliateCodeFromName("x"), "PARCEIRO");
});

Deno.test("telefone recebe DDI 55 quando vem só com DDD", () => {
  assertEquals(normalizePhone("(11) 99999-8888"), "5511999998888");
  assertEquals(normalizePhone("5511999998888"), "5511999998888");
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getActiveTenantMpToken, missingPaymentProviderResponse } from "../_shared/tenant-mp-token.ts";

Deno.test("Pedidos sem integração MP nunca usam o token global da plataforma", () => {
  const previous = Deno.env.get("MP_ACCESS_TOKEN");
  try {
    Deno.env.set("MP_ACCESS_TOKEN", "platform-token-test");
    assertEquals(getActiveTenantMpToken(null), null);
  } finally {
    if (previous === undefined) Deno.env.delete("MP_ACCESS_TOKEN");
    else Deno.env.set("MP_ACCESS_TOKEN", previous);
  }
});

Deno.test("Integração MP inativa não permite pagamento nem processamento de webhook", () => {
  assertEquals(getActiveTenantMpToken({ is_active: false, access_token: "tenant-token" }), null);
});

Deno.test("Integração MP ativa usa apenas a credencial da própria loja", () => {
  assertEquals(getActiveTenantMpToken({ is_active: true, access_token: "tenant-token" }), "tenant-token");
});

Deno.test("Integração MP sem credencial não permite pagamento", () => {
  assertEquals(getActiveTenantMpToken({ is_active: true, access_token: "   " }), null);
});

Deno.test("Sem provedor retorna 200 e success false sem link", async () => {
  const response = missingPaymentProviderResponse({ "Access-Control-Allow-Origin": "*" });
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await response.json();
  assertEquals(body.success, false);
  assertEquals(body.init_point, undefined);
  assertEquals(body.sandbox_init_point, undefined);
});
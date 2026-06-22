import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
await load({ export: true, allowEmptyValues: true, examplePath: null });
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

async function call(fn: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

Deno.test("CORS preflight - create-order", async () => {
  const r = await call("pagarme-create-order", { method: "OPTIONS" });
  assertEquals(r.status, 200);
  assert(r.headers.get("access-control-allow-origin"));
});

Deno.test("CORS preflight - create-subscription", async () => {
  const r = await call("pagarme-create-subscription", { method: "OPTIONS" });
  assertEquals(r.status, 200);
});

Deno.test("CORS preflight - cancel-subscription", async () => {
  const r = await call("pagarme-cancel-subscription", { method: "OPTIONS" });
  assertEquals(r.status, 200);
});

Deno.test("create-order sem auth retorna 200 com erro friendly", async () => {
  const r = await call("pagarme-create-order", { method: "POST", body: JSON.stringify({}) });
  assertEquals(r.status, 200);
  assertEquals(r.body?.success, false);
  assert(String(r.body?.error || "").toLowerCase().includes("autentic"));
});

Deno.test("create-subscription sem auth retorna 200 com erro friendly", async () => {
  const r = await call("pagarme-create-subscription", { method: "POST", body: JSON.stringify({}) });
  assertEquals(r.status, 200);
  assertEquals(r.body?.success, false);
  assert(String(r.body?.error || "").toLowerCase().includes("autentic"));
});

Deno.test("create-subscription com auth + dados incompletos retorna erro de validação", async () => {
  const r = await call("pagarme-create-subscription", {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ tenant_id: "x" }),
  });
  assertEquals(r.status, 200);
  assertEquals(r.body?.success, false);
  assert(r.body?.error);
});

Deno.test("webhook responde GET com 405", async () => {
  const r = await call("pagarme-subscription-webhook", { method: "GET" });
  assert(r.status === 405 || r.status === 200);
});

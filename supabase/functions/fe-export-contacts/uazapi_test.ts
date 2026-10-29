import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createUazapiMembers, extractParticipants } from "./uazapi.ts";

Deno.test("participantes ausentes não são tratados como grupo vazio", () => {
  assertEquals(extractParticipants({ group: { Participants: [] } }), []);
  assertEquals(extractParticipants({ participant_count: 42 }), undefined);
});

Deno.test("duas tentativas de info e fallback com participantes da listagem", async () => {
  const calls: { url: string; body?: unknown }[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(url.endsWith("/group/list")
      ? new Response(JSON.stringify({ groups: [{ JID: "g1", Participants: [{ PhoneNumber: "5511999990000" }] }] }))
      : new Response('{"error":"group unavailable"}', { status: 500 }));
  }) as typeof fetch;
  const load = createUazapiMembers({ uazapi_url: "https://example.invalid", uazapi_token: "test-only" }, fetcher);
  assertEquals((await load("g1")).length, 1);
  assertEquals(calls.length, 3);
  assertEquals(calls[1].body, { groupjid: "g1", getInviteLink: false, force: true });
});

Deno.test("contagem da listagem sem membros continua sendo falha", async () => {
  const fetcher = ((url: string) => Promise.resolve(url.endsWith("/group/list")
    ? new Response(JSON.stringify({ groups: [{ JID: "g1", participant_count: 42 }] }))
    : new Response('{"error":"group unavailable"}', { status: 500 }))) as typeof fetch;
  await assertRejects(() => createUazapiMembers({ uazapi_url: "https://example.invalid", uazapi_token: "test-only" }, fetcher)("g1"), Error, "uazapi 500");
});
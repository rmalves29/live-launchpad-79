// Carrega uma edge function do Supabase dentro do Node, com banco falso, variáveis de ambiente e
// chamadas externas (fetch) gravadas, sem tocar no código da função.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './fake-supabase.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
let loads = 0;

// Pausas de "digitando" e esperas anti-bloqueio passam na hora nos testes (o tempo real não importa aqui).
const realSetTimeout = globalThis.setTimeout;
let fastInstalled = false;
function installFastTimers() {
  if (fastInstalled) return;
  fastInstalled = true;
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms > 50 ? 0 : ms, ...args);
}

export async function loadEdgeFunction(name, { tables, rpc, functions, env = {}, fetchHandler, fast = true } = {}) {
  const sb = createFakeSupabase({ tables, rpc, functions });
  const calls = [];
  const fullEnv = { SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-teste', ...env };

  globalThis.__fakeSupabase = sb;
  globalThis.__edgeHandler = undefined;
  globalThis.Deno = {
    env: { get: (k) => fullEnv[k], toObject: () => ({ ...fullEnv }) },
    serve: (a, b) => { globalThis.__edgeHandler = typeof a === 'function' ? a : b; },
  };
  const pending = [];
  globalThis.EdgeRuntime = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); } };
  if (fast) installFastTimers();
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const call = { url, method: init.method || 'GET', headers: { ...(init.headers || {}) }, body: parseBody(init.body) };
    calls.push(call);
    const reply = fetchHandler ? await fetchHandler(call) : { status: 200, body: {} };
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };

  const file = pathToFileURL(path.join(ROOT, 'supabase/functions', name, 'index.ts')).href;
  await import(`${file}?load=${++loads}`);
  const handler = globalThis.__edgeHandler;
  if (!handler) throw new Error(`[tests] ${name} não registrou um handler`);

  return {
    sb,
    calls,
    async call(body, { method = 'POST', headers = {} } = {}) {
      const res = await handler(new Request(`https://teste.supabase.co/functions/v1/${name}`, {
        method,
        headers: { 'Content-Type': 'application/json', origin: 'https://app.cartzy.com.br', ...headers },
        body: method === 'GET' ? undefined : JSON.stringify(body),
      }));
      while (pending.length) await pending.shift();
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    },
  };
}

function parseBody(body) {
  if (body == null) return null;
  if (typeof body === 'string') { try { return JSON.parse(body); } catch { return body; } }
  if (body instanceof URLSearchParams) return Object.fromEntries(body);
  return body;
}

export function silenceLogs() {
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  console.log = console.warn = console.error = console.info = () => {};
  return () => Object.assign(console, original);
}

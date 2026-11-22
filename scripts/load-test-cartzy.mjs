// Node 24+: read-only, progressively increasing load against the public Cartzy APIs.
// Run from a network-enabled terminal: node scripts/load-test-cartzy.mjs --scenario catalog
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runReadonlyStage } from '../supabase/functions/_shared/readonly-load-stage.ts';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const scenario = arg('--scenario', 'catalog');
if (!['registration', 'catalog', 'catalog_version'].includes(scenario)) throw new Error('Only read-only scenarios: registration, catalog, catalog_version');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(new URL('../src/integrations/supabase/client.ts', import.meta.url), 'utf8');
const baseUrl = source.match(/const SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
const publicKey = source.match(/const SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)?.[1];
if (!baseUrl || !publicKey) throw new Error('Public API configuration not found');
const tenants = ['app', 'lagrandame'];
const stages = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
const directory = path.join(root, 'work', 'load-tests');
await mkdir(directory, { recursive: true });
const output = path.join(directory, `${scenario}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const report = { scenario, tenants, startedAt: new Date().toISOString(),
  limits: { maxConcurrency: 1024, maxRequestsPerStage: 2000, stageSeconds: 12, thinkTimeMs: 150, stopP95Ms: 3000, stopErrorRate: 0.02 },
  note: 'Concurrency is simultaneous request workers, not total connected customers. No order/payment/message is created. Short stages measure bursts, not long-duration endurance.',
  stages: [], status: 'running' };

if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ scenario, stages, tenants, targets: [new URL('/rest/v1/tenants_public', baseUrl).href, new URL('/functions/v1/live-shop', baseUrl).href], mutations: false, writes: false }, null, 2));
  process.exit(0);
}

const headers = { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' };
async function request(index) {
  const tenant = tenants[index % tenants.length];
  const registration = scenario === 'registration';
  const url = registration
    ? `${baseUrl}/rest/v1/tenants_public?select=id,name,slug,logo_url,primary_color&is_active=eq.true&slug=eq.${tenant}`
    : `${baseUrl}/functions/v1/live-shop`;
  const response = await fetch(url, { method: registration ? 'GET' : 'POST', headers,
    ...(registration ? {} : { body: JSON.stringify({ action: scenario, tenant_slug: tenant, offset: 0, limit: 60 }) }),
    signal: AbortSignal.timeout(8000) });
  const text = await response.text();
  let valid = false;
  try { const data = JSON.parse(text); valid = registration ? Array.isArray(data) && data.length === 1 : data.ok === true; } catch {}
  return { ok: response.ok && valid, status: response.status, bytes: Buffer.byteLength(text) };
}

try {
  for (let i = 0; i < tenants.length; i++) {
    const result = await request(i);
    if (!result.ok) throw new Error(`Baseline failed for ${tenants[i]} (HTTP ${result.status}); no load started`);
  }
  for (const concurrency of stages) {
    const result = await runReadonlyStage({ concurrency, seconds: 12, maxRequests: 2000 }, request);
    report.stages.push(result);
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ concurrency, rps: result.requestsPerSecond, p95Ms: result.p95Ms, errorRate: result.errorRate, stopReason: result.stopReason }));
    if (result.stopReason || result.errorRate > 0.02 || result.p95Ms > 3000) {
      report.status = 'degradation_detected';
      break;
    }
    // Recovery interval between stages; no retries or attempts to evade a rate limit.
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (report.status === 'running') report.status = 'stable_through_test_ceiling_not_absolute_limit';
} catch (error) {
  report.status = 'generator_or_baseline_failure';
  report.error = String(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`Report: ${output}`);
  console.log(`Result: ${report.status}`);
}

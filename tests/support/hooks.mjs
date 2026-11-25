// Ganchos de carregamento para rodar código do Cartzy (Vite e edge functions do Deno) dentro do Node.
// Nada aqui é usado em produção: só os testes passam por este arquivo.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const SRC = path.join(ROOT, 'src');
const STUBS = path.join(ROOT, 'tests/support/stubs');

const stub = (name) => ({ url: pathToFileURL(path.join(STUBS, name)).href, shortCircuit: true });

function withExtension(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (/^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/.test(specifier)) return stub('deno-http-server.mjs');
  if (/(^https:\/\/esm\.sh\/|^npm:|^jsr:)@supabase\/supabase-js/.test(specifier)) return stub('supabase-js.mjs');
  if (specifier === '@/integrations/supabase/client') return stub('supabase-client.mjs');
  if (specifier === 'react') return stub('react.mjs');
  if (specifier.startsWith('https:') || specifier.startsWith('npm:') || specifier.startsWith('jsr:')) {
    throw new Error(`[tests] importação externa sem substituto de teste: ${specifier}`);
  }
  if (specifier.startsWith('@/')) {
    const file = withExtension(path.join(SRC, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(parentDir, specifier.split('?')[0]);
    if (!existsSync(target) || !statSync(target).isFile()) {
      const file = withExtension(target);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

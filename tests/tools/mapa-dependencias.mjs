// Gera docs/refatoracao/mapa-dependencias.md: quem depende de quem no Cartzy.
// Uso: node tests/tools/mapa-dependencias.mjs   (só lê o código; não muda nada no sistema)
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const FUNCS = path.join(ROOT, 'supabase/functions');
const SRC = path.join(ROOT, 'src');
const MIGR = path.join(ROOT, 'supabase/migrations');

const walk = (dir, exts) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p, exts);
  return exts.some((e) => n.endsWith(e)) ? [p] : [];
});
const rel = (p) => path.relative(ROOT, p);
const lines = (s) => s.split('\n').length;

const functionNames = readdirSync(FUNCS).filter((n) => !n.startsWith('_') && existsSync(path.join(FUNCS, n, 'index.ts'))).sort();
const shared = readdirSync(path.join(FUNCS, '_shared')).filter((n) => n.endsWith('.ts') && !/_?test\.ts$/.test(n)).sort();
const read = (p) => readFileSync(p, 'utf8');

const callRe = (name) => new RegExp(`(functions\\.invoke\\(\\s*['"\`]${name}['"\`]|/functions/v1/${name}(?![a-z0-9-]))`);
const tablesOf = (code) => [...new Set([...code.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g)].map((m) => m[1]))].sort();
const rpcsOf = (code) => [...new Set([...code.matchAll(/\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)].map((m) => m[1]))].sort();

const sharedCode = Object.fromEntries(shared.map((s) => [s, read(path.join(FUNCS, '_shared', s))]));
// código da função + dos módulos _shared que ela usa (direta ou indiretamente), para achar quem chama quem
function withShared(code, seen = new Set()) {
  let out = code;
  for (const s of shared) {
    if (seen.has(s) || !new RegExp(`(_shared/|\\./)${s.replace('.', '\\.')}`).test(code)) continue;
    seen.add(s);
    out += '\n' + withShared(sharedCode[s], seen);
  }
  return out;
}
const ownCode = Object.fromEntries(functionNames.map((n) => [n, walk(path.join(FUNCS, n), ['.ts']).map(read).join('\n')]));
const funcCode = Object.fromEntries(functionNames.map((n) => [n, withShared(ownCode[n])]));
const srcFiles = walk(SRC, ['.ts', '.tsx']).filter((f) => !f.endsWith('types.ts'));
const srcCode = Object.fromEntries(srcFiles.map((f) => [rel(f), read(f)]));
const sqlCode = walk(MIGR, ['.sql']).map(read).join('\n');

const rows = functionNames.map((n) => {
  const code = funcCode[n];
  const usesShared = shared.filter((s) => ownCode[n].includes(`_shared/${s}`)).map((s) => s.replace(".ts", ""));
  const calls = functionNames.filter((o) => o !== n && callRe(o).test(code));
  const calledByFunctions = functionNames.filter((o) => o !== n && callRe(n).test(funcCode[o]));
  const calledByScreens = Object.keys(srcCode).filter((f) => callRe(n).test(srcCode[f]));
  const calledBySql = callRe(n).test(sqlCode);
  return { n, lines: lines(ownCode[n]), usesShared, calls, calledByFunctions, calledByScreens, calledBySql, tables: tablesOf(code), rpcs: rpcsOf(code) };
});

const noCallers = rows.filter((r) => !r.calledByFunctions.length && !r.calledByScreens.length && !r.calledBySql);
const sharedUse = shared.map((s) => ({ s: s.replace('.ts', ''), by: rows.filter((r) => r.usesShared.includes(s.replace('.ts', ''))).map((r) => r.n) }));

// tabelas tocadas por mais lugares = ligações escondidas mais prováveis
const tableUse = {};
for (const r of rows) for (const t of r.tables) (tableUse[t] ||= { f: new Set(), s: new Set() }).f.add(r.n);
for (const [f, code] of Object.entries(srcCode)) for (const t of tablesOf(code)) (tableUse[t] ||= { f: new Set(), s: new Set() }).s.add(f);
const topTables = Object.entries(tableUse).map(([t, u]) => ({ t, f: u.f.size, s: u.s.size })).sort((a, b) => b.f + b.s - (a.f + a.s)).slice(0, 25);

const list = (a, max = 8) => (a.length ? (a.length > max ? `${a.slice(0, max).join(', ')} … (+${a.length - max})` : a.join(', ')) : '—');

let md = `# Mapa de dependências do Cartzy

Gerado automaticamente por \`node tests/tools/mapa-dependencias.mjs\` (só lê o código).
Rode de novo depois de cada etapa da refatoração para ver o que mudou.

## Números gerais

| | |
|---|---|
| Edge functions com código no repositório | ${functionNames.length} |
| Módulos compartilhados (\`_shared\`) | ${shared.length} |
| Arquivos do front (sem \`types.ts\` gerado) | ${srcFiles.length} |
| Funções sem ninguém chamando no código (tela, outra função ou SQL) | ${noCallers.length} |

> "Sem ninguém chamando no código" não quer dizer morta. Três casos ficam de fora desta busca:
> webhooks chamados de fora (Bling, Mercado Pago, Pagar.me, UazAPI...), agendamentos criados direto no painel do Supabase
> e nomes montados na hora (ex.: \`invoke(functionName)\` na tela de etiquetas e no checkout de assinatura).
> Cruze com a varredura de 90 dias de chamadas antes de remover qualquer uma (etapa 2).

## Tabelas mais compartilhadas (onde mudar uma coluna mexe em mais lugares)

| Tabela | Edge functions | Arquivos do front |
|---|---|---|
${topTables.map((t) => `| \`${t.t}\` | ${t.f} | ${t.s} |`).join('\n')}

## Módulos compartilhados e quem usa

| Módulo | Usado por |
|---|---|
${sharedUse.map((u) => `| \`${u.s}\` | ${u.by.length ? `${u.by.length}: ${list(u.by, 6)}` : '**ninguém**'} |`).join('\n')}

## Funções sem chamada no código

${noCallers.map((r) => `\`${r.n}\``).join(', ')}

## Todas as edge functions

| Função | Linhas | Chamada por (telas / funções / SQL) | Chama | Usa \`_shared\` | Tabelas |
|---|---|---|---|---|---|
${rows.map((r) => `| \`${r.n}\` | ${r.lines} | ${r.calledByScreens.length} / ${r.calledByFunctions.length} / ${r.calledBySql ? 'sim' : '—'} | ${list(r.calls, 4)} | ${list(r.usesShared, 4)} | ${r.tables.length} |`).join('\n')}
`;

const out = path.join(ROOT, 'docs/refatoracao');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'mapa-dependencias.md'), md);
console.log(`mapa gerado: ${rel(path.join(out, 'mapa-dependencias.md'))} (${functionNames.length} funções, ${noCallers.length} sem chamada no código)`);

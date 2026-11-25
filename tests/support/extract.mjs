// Lê funções internas (não exportadas) de um arquivo .ts, só para teste, sem alterar o arquivo.
// Usado para comparar regras que existem em duas cópias (ex.: cupom calculado na tela e no servidor).
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

function sliceFunction(source, name) {
  const arrow = source.match(new RegExp(`(^|\\n)const\\s+${name}\\s*=\\s*\\([^\\n]*\\n`));
  if (arrow) return arrow[0].trim();
  const start = source.search(new RegExp(`(^|\\n)(async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`[tests] função ${name} não encontrada`);
  let i = source.indexOf('{', source.indexOf(')', source.indexOf(`function ${name}`)));
  // pula a anotação de retorno, que pode ter chaves (ex.: ): { ok: boolean } {)
  const header = source.slice(source.indexOf(`function ${name}`), i);
  const returnType = header.match(/\)\s*:\s*$/);
  if (returnType) i = skipBlock(source, i) + 1, i = source.indexOf('{', i);
  const end = skipBlock(source, i);
  return source.slice(start, end + 1).trim();
}

function skipBlock(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { i = skipString(source, i, c); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('[tests] bloco sem fechamento');
}

function skipString(source, i, quote) {
  for (let j = i + 1; j < source.length; j++) {
    if (source[j] === '\\') { j++; continue; }
    // template string com ${ ... } (que pode ter outra template dentro)
    if (quote === '`' && source[j] === '$' && source[j + 1] === '{') { j = skipBlock(source, j + 1); continue; }
    if (source[j] === quote) return j;
  }
  return source.length;
}

// Funções de várias linhas declaradas DENTRO de um componente (`const nome = (async) (...) => { ... }`).
// Lê o texto original da tela e o roda com as dependências passadas em `globals` (supabase, toast, setState...),
// para testar a conta que a tela faz hoje sem copiar nada à mão.
function sliceInnerArrow(source, name) {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(async\\s*)?\\(`).exec(source);
  if (!m) throw new Error(`[tests] função interna ${name} não encontrada`);
  const arrow = source.indexOf('=>', m.index);
  const open = source.indexOf('{', arrow);
  const end = skipBlock(source, open);
  return source.slice(m.index, end + 1).trim() + ';';
}

export function extractInnerArrows(relativeFile, names, globals = {}) {
  const source = readFileSync(path.join(ROOT, relativeFile), 'utf8');
  const code = names.map((n) => sliceInnerArrow(source, n)).join('\n\n');
  const js = stripTypeScriptTypes(code, { mode: 'strip' });
  const factory = new Function(...Object.keys(globals), `${js}\nreturn { ${names.join(', ')} };`);
  return factory(...Object.values(globals));
}

export function extractFunctions(relativeFile, names, globals = {}) {
  const source = readFileSync(path.join(ROOT, relativeFile), 'utf8');
  const code = names.map((n) => sliceFunction(source, n)).join('\n\n');
  const js = stripTypeScriptTypes(code, { mode: 'strip' });
  const factory = new Function(...Object.keys(globals), `${js}\nreturn { ${names.join(', ')} };`);
  return factory(...Object.values(globals));
}

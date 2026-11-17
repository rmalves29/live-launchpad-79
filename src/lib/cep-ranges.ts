// Frete personalizado por CEP ou faixa de CEP.
// Cada item é guardado como "INICIO-FIM" com 8 dígitos (CEP único: início = fim), ex.: "60165270-60165270", "30000000-31999999".

const onlyDigits = (v: string) => String(v ?? '').replace(/\D/g, '');

/**
 * Lê o texto digitado pela lojista: um item por linha (ou separados por vírgula/ponto e vírgula).
 * Aceita CEP único ("60165-270", "60165270") e faixa ("30000-000 a 31999-999", "30000000-31999999", "30000-000 até 31999-999").
 * CEP de 5 dígitos (prefixo, ex.: "60165") vale como a faixa 60165-000 a 60165-999.
 */
export function parseCepRanges(text: string): { ranges: string[]; invalid: string[] } {
  const ranges: string[] = [];
  const invalid: string[] = [];
  const items = String(text ?? '').split(/[\n;,]+/).map((s) => s.trim()).filter(Boolean);
  for (const item of items) {
    // separador de faixa: " a ", " até ", " ate ", ou um hífen entre dois números completos (30000000-31999999)
    const parts = item.split(/\s+(?:a|at[eé])\s+/i);
    let from = '';
    let to = '';
    if (parts.length === 2) {
      from = onlyDigits(parts[0]);
      to = onlyDigits(parts[1]);
    } else {
      const compact = item.replace(/\s+/g, '');
      const dash = compact.match(/^(\d{8})-(\d{8})$/);
      if (dash) { from = dash[1]; to = dash[2]; }
      else { from = onlyDigits(item); to = from; }
    }
    // prefixo de 5 dígitos: vale a faixa inteira daquele prefixo
    if (from.length === 5 && to.length === 5) { from = from + '000'; to = to + '999'; }
    if (from.length !== 8 || to.length !== 8 || Number(from) > Number(to)) { invalid.push(item); continue; }
    ranges.push(`${from}-${to}`);
  }
  return { ranges, invalid };
}

/** Devolve as faixas guardadas como texto, uma por linha, para editar (CEP único aparece sem faixa). */
export function formatCepRanges(ranges: string[] | null | undefined): string {
  const fmt = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
  return (ranges || []).map((r) => {
    const [a, b] = String(r).split('-');
    return a === b ? fmt(a) : `${fmt(a)} a ${fmt(b)}`;
  }).join('\n');
}

/** O CEP da cliente está em alguma das faixas? CEP incompleto nunca casa. */
export function cepInRanges(cep: string | null | undefined, ranges: string[] | null | undefined): boolean {
  const c = onlyDigits(cep || '');
  if (c.length !== 8 || !ranges?.length) return false;
  const n = Number(c);
  return ranges.some((r) => {
    const [a, b] = String(r).split('-');
    return n >= Number(a) && n <= Number(b);
  });
}

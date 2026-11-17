// Cor e tamanho de uma variação de produto vinda de um ERP (Bling/Olist).
// O ERP manda a variação como pares "chave:valor" (ex.: Cor:Dourado;Tamanho:P ou só Aros:15).
// Regra: cor = chave de cor; tamanho = chave de tamanho conhecida OU qualquer outro atributo que não seja cor.
// Sem isso a variação nasce sem tamanho e a cliente não consegue escolher no checkout.
const COLOR_KEYS = ["cor", "cores", "color", "colour"];
const SIZE_KEYS = ["tamanho", "tam", "size", "numero", "número", "aro", "aros", "medida", "medidas"];

export function splitVariation(attrs: Record<string, string>, bare = "") {
  const a: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (String(v ?? "").trim()) a[k.trim().toLowerCase()] = String(v).trim();
  const color = COLOR_KEYS.map((k) => a[k]).find(Boolean) || null;
  let size = SIZE_KEYS.map((k) => a[k]).find(Boolean) || null;
  if (!size) {
    const resto = Object.entries(a).filter(([k]) => !COLOR_KEYS.includes(k)).map(([, v]) => v);
    if (resto.length) size = resto.join(" / ");
  }
  const texto = String(bare || "").trim();
  if (!size && !color && texto && !texto.includes(":")) size = texto;
  const values = Object.values(a);
  return { color, size, label: values.length ? values.join(" / ") : texto };
}

/** Olist: grade = [{ chave, valor }, ...] */
export function variationFromGrade(grade: any, descricao = "") {
  const attrs: Record<string, string> = {};
  for (const g of Array.isArray(grade) ? grade : []) if (g?.chave && g?.valor) attrs[String(g.chave)] = String(g.valor);
  return splitVariation(attrs, descricao);
}

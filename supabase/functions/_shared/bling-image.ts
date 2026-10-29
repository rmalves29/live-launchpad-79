// Foto de produto vinda do Bling.
// O Bling devolve as fotos em dois grupos: `externas` (link público fixo) e `internas` (foto enviada para o Bling,
// com link assinado do S3 que EXPIRA em ~7 dias). Foto interna é baixada e guardada no Storage do Cartzy.
// deno-lint-ignore-file no-explicit-any

const BUCKET = "product-images";

/** Primeira foto do produto: link externo se existir, senão o interno. */
export function pickBlingImage(prod: any): { link: string; internal: boolean } | null {
  const ext = prod?.midia?.imagens?.externas?.[0]?.link;
  if (ext) return { link: String(ext), internal: false };
  const int = prod?.midia?.imagens?.internas?.[0]?.link;
  if (int) return { link: String(int), internal: true };
  const legacy = prod?.imagemURL;
  if (legacy) return { link: String(legacy), internal: false };
  return null;
}

/** Devolve uma URL estável: externa passa direto; interna é copiada para o Storage. */
export async function resolveBlingImage(supabase: any, tenantId: string, blingId: number | string, prod: any): Promise<string | null> {
  const pick = pickBlingImage(prod);
  if (!pick) return null;
  if (!pick.internal) return pick.link;

  try {
    const res = await fetch(pick.link, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const key = new URL(pick.link).pathname.split("/").pop() || String(blingId);
    const path = `bling/${tenantId}/${blingId}-${key}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
    if (error) {
      console.error("[bling-image] upload:", error.message);
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[bling-image] download:", (e as Error).message);
    return null;
  }
}

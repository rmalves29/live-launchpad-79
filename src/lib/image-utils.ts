/**
 * Otimização de imagens servidas pelo Supabase Storage.
 *
 * Usa o endpoint /storage/v1/render/image/public/<bucket>/<path>
 * que aplica resize on-the-fly (Imgproxy) e adiciona cache de 1 ano,
 * reduzindo drasticamente o egress do bucket.
 *
 * Para URLs externas (Instagram, ui-avatars etc.) retorna a URL como veio.
 */

const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/';
const SUPABASE_RENDER_PREFIX = '/storage/v1/render/image/public/';

export type OptimizedImageOptions = {
  /** Largura alvo em px (default 400). Altura é proporcional. */
  width?: number;
  /** Qualidade JPEG/WEBP (1-100, default 70). */
  quality?: number;
  /** Modo de redimensionamento. */
  resize?: 'cover' | 'contain' | 'fill';
};

/**
 * Converte uma URL pública do Supabase Storage para a versão renderizada
 * (resize + qualidade), mantendo URLs externas inalteradas.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  options: OptimizedImageOptions = {}
): string {
  if (!url) return '';

  const { width = 400, quality = 70, resize = 'cover' } = options;

  // Apenas processa URLs do Supabase Storage público
  const idx = url.indexOf(SUPABASE_PUBLIC_PREFIX);
  if (idx === -1) {
    return url;
  }

  const base = url.slice(0, idx);
  const path = url.slice(idx + SUPABASE_PUBLIC_PREFIX.length);

  // Não re-otimizar SVGs/GIFs (Imgproxy não suporta bem)
  if (/\.(svg|gif)(\?|$)/i.test(path)) {
    return url;
  }

  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality),
    resize,
  });

  return `${base}${SUPABASE_RENDER_PREFIX}${path}?${params.toString()}`;
}

/** Atalho para thumbnail de listagens (400px). */
export const thumbUrl = (url?: string | null) => optimizedImageUrl(url, { width: 400 });

/** Atalho para avatares pequenos (96px). */
export const avatarUrl = (url?: string | null) => optimizedImageUrl(url, { width: 96 });

/**
 * Cache-Control padrão usado em uploads (1 ano).
 * Repassar como `{ cacheControl: STORAGE_CACHE_CONTROL }` no .upload().
 */
export const STORAGE_CACHE_CONTROL = '31536000';

/**
 * Importar produtos do Bling para o Cartzy.
 * Passo 1: "Buscar produtos" mostra uma prévia (nada é gravado). Passo 2: "Importar selecionados" cria no Cartzy.
 * O saldo vem do depósito escolhido na integração; o código do Bling vai para o SKU ERP; produtos com variação viram pai + filhos.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Download, Loader2, Search, Info, Package, ZoomIn, X } from 'lucide-react';

interface Props {
  tenantId: string;
  depositName: string | null;
  stores: Array<{ id: number; descricao: string; tipo: string }> | undefined;
}

interface PreviewRow {
  bling_id: number;
  codigo: string;
  nome: string;
  preco: number;
  formato: string;
  saldo: number | null;
  children_count?: number | null;
  imagem: string | null;
  status: 'novo' | 'existe' | 'vinculado';
  cartzy_id: number | null;
}

interface ImportResult {
  bling_id: number;
  status: 'criado' | 'vinculado' | 'ja_vinculado' | 'erro';
  children?: number;
  error?: string;
  note?: string;
}

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CHUNK = 8; // limite da API do Bling: 3 requisições por segundo

const PAGE_SIZES = [25, 50, 100];
const MAX_PAGES = 300; // trava de segurança: 300 páginas de 50 = 15 mil produtos

// Lista completa guardada no navegador (localStorage): permite filtrar na hora, sem falar com o Bling.
// "Buscar produtos" sempre refaz do zero e sobrescreve. Foto só vai para o cache se o link for curto (link assinado é grande e expira).
type CacheEntry = { key: string; at: number; rows: PreviewRow[] };
const cacheKey = (tenantId: string) => `bling-import-cache:${tenantId}`;
function readCache(tenantId: string): CacheEntry | null {
  try { const raw = localStorage.getItem(cacheKey(tenantId)); return raw ? (JSON.parse(raw) as CacheEntry) : null; } catch { return null; }
}
function writeCache(tenantId: string, entry: CacheEntry) {
  try {
    const slim = entry.rows.map((r) => ({ ...r, imagem: r.imagem && r.imagem.length <= 160 ? r.imagem : null }));
    localStorage.setItem(cacheKey(tenantId), JSON.stringify({ ...entry, rows: slim }));
  } catch { /* sem espaço ou sem armazenamento: a lista só vale nesta visita */ }
}
const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('bling-import-products', { body });
  if (error) throw new Error(error.message || 'Falha ao falar com o servidor');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function BlingProductsImportPanel({ tenantId, depositName, stores }: Props) {
  const [search, setSearch] = useState('');
  const [storeId, setStoreId] = useState('');
  const [saleType, setSaleType] = useState<'BAZAR' | 'LIVE' | 'AMBOS'>('AMBOS');
  const [onlyStock, setOnlyStock] = useState(true);
  // foto ampliada ao passar o mouse na lupa (fixa na tela, para não ser cortada pela rolagem da lista)
  const [zoom, setZoom] = useState<{ src: string; top: number; left: number } | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const cancelRef = useRef(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Record<number, ImportResult>>({});

  const listKey = `${storeId}|${onlyStock}`;

  // lista salva de uma visita anterior (mesma loja e mesmo filtro de estoque)
  useEffect(() => {
    const c = readCache(tenantId);
    if (c && c.key === listKey && c.rows.length) { setRows(c.rows); setSavedAt(c.at); } else { setRows([]); setSavedAt(null); }
    setPage(0); setSelected(new Set()); setResults({});
  }, [tenantId, listKey]);

  // Traz TODOS os produtos do Bling (página por página, até acabar) e guarda a lista no navegador.
  async function load() {
    setLoading(true);
    setLoaded(0);
    cancelRef.current = false;
    const map = new Map<number, PreviewRow>();
    let finished = false;
    try {
      for (let pg = 1; pg <= MAX_PAGES && !cancelRef.current; pg++) {
        const data = await call({ tenant_id: tenantId, action: 'preview', page: pg, search: '', store_id: storeId ? Number(storeId) : null, only_stock: onlyStock });
        // o mesmo produto pai pode voltar em páginas diferentes (as variações caem em páginas distintas): junta em vez de repetir
        for (const r of data.rows as PreviewRow[]) {
          const before = map.get(r.bling_id);
          map.set(r.bling_id, before && before.children_count != null && r.children_count != null ? { ...r, children_count: before.children_count + r.children_count } : r);
        }
        setLoaded(map.size);
        if (!data.has_more) { finished = true; break; }
      }
      const list = Array.from(map.values());
      if (!finished) {
        toast.message(`Carregamento interrompido: ${list.length} produtos (lista parcial, não foi salva).`);
        setRows(list);
        setSavedAt(null);
      } else {
        const at = Date.now();
        setRows(list);
        setSavedAt(at);
        writeCache(tenantId, { key: listKey, at, rows: list });
        toast.success(`${list.length} produtos carregados do Bling e salvos neste navegador.`);
      }
      setPage(0);
      setSelected(new Set());
      setResults({});
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar produtos do Bling');
    } finally {
      setLoading(false);
    }
  }

  // filtro instantâneo (em qualquer parte do nome ou do código), sem chamar o Bling
  const filtered = useMemo(() => {
    const words = norm(search).split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((r) => { const t = `${norm(r.nome)} ${norm(r.codigo)}`; return words.every((w) => t.includes(w)); });
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  useEffect(() => { setPage(0); }, [search, pageSize]);

  const importable = pageRows.filter((r) => r.status !== 'vinculado' && results[r.bling_id]?.status !== 'criado' && results[r.bling_id]?.status !== 'vinculado');
  const toggle = (id: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = importable.length > 0 && importable.every((r) => selected.has(r.bling_id));

  async function runImport() {
    const ids = rows.filter((r) => selected.has(r.bling_id) && r.status !== 'vinculado').map((r) => r.bling_id);
    if (!ids.length) return;
    setImporting(true);
    setProgress({ done: 0, total: ids.length });
    let created = 0, linked = 0, failed = 0;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const part = ids.slice(i, i + CHUNK);
        const data = await call({ tenant_id: tenantId, action: 'import', bling_ids: part, sale_type: saleType });
        const map: Record<number, ImportResult> = {};
        for (const r of data.results as ImportResult[]) {
          map[r.bling_id] = r;
          if (r.status === 'criado') created++; else if (r.status === 'vinculado' || r.status === 'ja_vinculado') linked++; else failed++;
        }
        setResults((prev) => ({ ...prev, ...map }));
        const doneIds = new Set((data.results as ImportResult[]).filter((r) => r.status === 'criado' || r.status === 'vinculado' || r.status === 'ja_vinculado').map((r) => r.bling_id));
        if (doneIds.size) {
          setRows((prev) => {
            const next = prev.map((r) => (doneIds.has(r.bling_id) ? { ...r, status: 'vinculado' as const } : r));
            if (savedAt) writeCache(tenantId, { key: listKey, at: savedAt, rows: next });
            return next;
          });
        }
        setProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length });
      }
      setSelected(new Set());
      toast.success(`Importação concluída: ${created} criado(s), ${linked} vinculado(s)${failed ? `, ${failed} com erro` : ''}.`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro na importação. O que já foi importado foi mantido.');
    } finally {
      setImporting(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="h-5 w-5" />
          Importar produtos do Bling
        </CardTitle>
        <CardDescription>
          Traz produtos do Bling para o Cartzy. Nada é alterado no Bling.
          {depositName ? <> O estoque vem do depósito <strong>{depositName}</strong>.</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="imp_search">Filtrar por nome ou SKU</Label>
            <div className="relative">
              <Input id="imp_search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={rows.length ? 'Ex.: londres ou BR-001' : 'Busque os produtos primeiro'} disabled={rows.length === 0} className="pr-9" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Limpar filtro"><X className="h-4 w-4" /></button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="imp_store">Só produtos da loja</Label>
            <select id="imp_store" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {stores?.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="imp_sale">Vender no Cartzy como</Label>
            <select id="imp_sale" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={saleType} onChange={(e) => setSaleType(e.target.value as any)}>
              <option value="AMBOS">Bazar e Live</option>
              <option value="BAZAR">Só bazar</option>
              <option value="LIVE">Só live</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={onlyStock} onCheckedChange={(v) => setOnlyStock(v === true)} aria-label="Só produtos com estoque no depósito" />
          Só produtos com estoque no depósito{depositName ? <> <strong>{depositName}</strong></> : null}
          <span className="text-xs text-muted-foreground">(desmarque para ver todos os produtos ativos)</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => load()} disabled={loading || importing || !depositName} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            {loading ? `Carregando… ${loaded} produtos` : rows.length ? 'Buscar de novo no Bling' : 'Buscar produtos'}
          </Button>
          {loading && <Button variant="ghost" onClick={() => { cancelRef.current = true; }}>Parar</Button>}
          {rows.length > 0 && (
            <Button onClick={runImport} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Importar selecionados ({selected.size})
            </Button>
          )}
        </div>

        {savedAt && !loading && (
          <p className="text-xs text-muted-foreground">
            Lista salva neste navegador em {new Date(savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {rows.length} produtos{search ? ` (${filtered.length} no filtro)` : ''}. Clique em <b>Buscar de novo no Bling</b> para refazer a lista do zero.
          </p>
        )}

        {!depositName && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Escolha o depósito do estoque no cartão "Loja e depósito" (e salve) antes de importar.</AlertDescription>
          </Alert>
        )}

        {progress && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Importando {progress.done} de {progress.total}…</p>
          </div>
        )}

        {rows.length > 0 && filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhum produto da lista combina com "{search}".</p>
        )}

        {filtered.length > 0 && (
          <div className="rounded-lg border">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected((prev) => { const n = new Set(prev); importable.forEach((r) => (v === true ? n.add(r.bling_id) : n.delete(r.bling_id))); return n; })}
                aria-label="Marcar todos os importáveis desta página"
                disabled={importable.length === 0 || importing}
              />
              <span className="flex-1">Produto (código do Bling)</span>
              <span className="w-20 text-right">Preço</span>
              <span className="w-16 text-right">Estoque</span>
              <span className="w-28 text-right">Situação</span>
            </div>
            <ul className="divide-y max-h-[520px] overflow-auto">
              {pageRows.map((r) => {
                const res = results[r.bling_id];
                const done = res?.status === 'criado' || res?.status === 'vinculado' || res?.status === 'ja_vinculado';
                const disabled = r.status === 'vinculado' || done || importing;
                return (
                  <li key={r.bling_id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox checked={selected.has(r.bling_id)} onCheckedChange={() => toggle(r.bling_id)} disabled={disabled} aria-label={`Selecionar ${r.nome}`} />
                    <div
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-white"
                      onMouseEnter={(e) => {
                        if (!r.imagem) return;
                        const b = e.currentTarget.getBoundingClientRect();
                        const size = 300;
                        setZoom({ src: r.imagem, left: Math.min(b.right + 8, window.innerWidth - size - 8), top: Math.max(8, Math.min(b.top - 20, window.innerHeight - size - 8)) });
                      }}
                      onMouseLeave={() => setZoom(null)}
                    >
                      {r.imagem ? (
                        <>
                          <img src={r.imagem} alt="" loading="lazy" className="h-full w-full object-contain" />
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 p-0.5 text-white"><ZoomIn className="h-3 w-3" /></span>
                        </>
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{r.codigo}</span>
                        {r.formato === 'V' && <span className="ml-2 text-primary">com variações{r.children_count ? ` (${r.children_count} com estoque)` : ''}</span>}
                        {res?.children ? <span className="ml-2">· {res.children} variação(ões) criada(s)</span> : null}
                        {res?.note ? <span className="ml-2 text-amber-700">· {res.note}</span> : null}
                        {res?.status === 'erro' ? <span className="ml-2 text-destructive">· {res.error}</span> : null}
                      </p>
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums">{r.formato === 'V' ? '—' : money(r.preco)}</span>
                    <span className="w-16 text-right text-sm tabular-nums">{r.saldo ?? '—'}</span>
                    <span className="w-28 text-right">
                      {res?.status === 'criado' ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Criado</Badge>
                        : res?.status === 'vinculado' ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Vinculado</Badge>
                        : res?.status === 'erro' ? <Badge variant="destructive">Erro</Badge>
                        : r.status === 'vinculado' ? <Badge variant="secondary">Já no Cartzy</Badge>
                        : r.status === 'existe' ? <Badge className="bg-amber-500 hover:bg-amber-500">Vincular</Badge>
                        : <Badge variant="outline">Novo</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {zoom && (
          <div className="pointer-events-none fixed z-[100] rounded-lg border bg-white p-1 shadow-xl" style={{ top: zoom.top, left: zoom.left, width: 300, height: 300 }}>
            <img src={zoom.src} alt="" className="h-full w-full object-contain" />
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              Por página
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" aria-label="Produtos por página">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</Button>
              <span>Página {safePage + 1} de {pages}</span>
              <Button size="sm" variant="outline" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Próxima</Button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            "Novo" cria o produto no Cartzy. "Vincular" liga um produto que já existe no Cartzy (mesmo código) ao do Bling, sem mudar nada nele. O código do Bling vai para o SKU ERP e o Cartzy cria o próprio código (C001, C002...).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

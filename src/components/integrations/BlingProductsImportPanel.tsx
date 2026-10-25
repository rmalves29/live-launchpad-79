/**
 * Importar produtos do Bling para o Cartzy.
 * Passo 1: "Buscar produtos" mostra uma prévia (nada é gravado). Passo 2: "Importar selecionados" cria no Cartzy.
 * O saldo vem do depósito escolhido na integração; o código do Bling vai para o SKU ERP; produtos com variação viram pai + filhos.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Download, Loader2, Search, Info, Package, ZoomIn } from 'lucide-react';

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
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Record<number, ImportResult>>({});

  async function load(nextPage: number, append: boolean) {
    setLoading(true);
    try {
      const data = await call({ tenant_id: tenantId, action: 'preview', page: nextPage, search, store_id: storeId ? Number(storeId) : null, only_stock: onlyStock });
      setRows((prev) => {
        if (!append) return data.rows as PreviewRow[];
        // o mesmo produto pai pode voltar em páginas diferentes (as variações caem em páginas distintas): junta em vez de repetir
        const map = new Map<number, PreviewRow>(prev.map((r) => [r.bling_id, r]));
        for (const r of data.rows as PreviewRow[]) {
          const before = map.get(r.bling_id);
          map.set(r.bling_id, before && before.children_count != null && r.children_count != null ? { ...r, children_count: before.children_count + r.children_count } : r);
        }
        return Array.from(map.values());
      });
      setPage(nextPage);
      setHasMore(!!data.has_more);
      if (!append) { setSelected(new Set()); setResults({}); }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar produtos do Bling');
    } finally {
      setLoading(false);
    }
  }

  const importable = rows.filter((r) => r.status !== 'vinculado' && results[r.bling_id]?.status !== 'criado' && results[r.bling_id]?.status !== 'vinculado');
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
            <Label htmlFor="imp_search">Buscar por nome</Label>
            <Input id="imp_search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: brinco" onKeyDown={(e) => { if (e.key === 'Enter') load(1, false); }} />
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
          <Button onClick={() => load(1, false)} disabled={loading || importing || !depositName} variant="outline">
            {loading && page === 0 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Buscar produtos
          </Button>
          {rows.length > 0 && (
            <Button onClick={runImport} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Importar selecionados ({selected.size})
            </Button>
          )}
        </div>

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

        {rows.length > 0 && (
          <div className="rounded-lg border">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v === true ? new Set(importable.map((r) => r.bling_id)) : new Set())}
                aria-label="Marcar todos os importáveis"
                disabled={importable.length === 0 || importing}
              />
              <span className="flex-1">Produto (código do Bling)</span>
              <span className="w-20 text-right">Preço</span>
              <span className="w-16 text-right">Estoque</span>
              <span className="w-28 text-right">Situação</span>
            </div>
            <ul className="divide-y max-h-[520px] overflow-auto">
              {rows.map((r) => {
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

        {hasMore && (
          <Button variant="outline" onClick={() => load(page + 1, true)} disabled={loading || importing}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Carregar mais
          </Button>
        )}

        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            "Novo" cria o produto no Cartzy. "Vincular" liga um produto que já existe no Cartzy (mesmo código) ao do Bling, sem mudar nada nele. O código "C" fica igual ao código do Bling até você editar o produto.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

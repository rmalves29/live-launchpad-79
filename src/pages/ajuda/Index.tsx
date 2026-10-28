import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ALL_HELP_PAGES,
  HELP_GROUPS,
  extractYoutubeId,
  getHelpGroup,
  helpPageRank,
} from '@/lib/help-page-key';
import { TutorialFormDialog, type TutorialRow } from '@/components/ajuda/TutorialFormDialog';
import { toast } from 'sonner';
import { Play, Search, X, Plus, Pencil, Trash2, PlayCircle } from 'lucide-react';

type Tutorial = TutorialRow;

const pageLabel = (key: string) => ALL_HELP_PAGES.find((p) => p.key === key)?.label || key;
const thumb = (url: string) => {
  const id = extractYoutubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
};

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';
  const activePage = params.get('page') || '';
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tutorial | null>(null);

  async function load() {
    const { data } = await supabase.from('help_tutorials').select('*').order('sort_order');
    setItems((data as Tutorial[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(t: Tutorial) {
    setEditing(t);
    setFormOpen(true);
  }

  async function remove(t: Tutorial) {
    if (!confirm(`Excluir "${t.title}"?`)) return;
    const { error } = await supabase.from('help_tutorials').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    toast.success('Vídeo excluído.');
    load();
  }

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => helpPageRank(a.page_key) - helpPageRank(b.page_key) || a.sort_order - b.sort_order
      ),
    [items]
  );

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      sorted.filter((t) => {
        if (activeGroup && getHelpGroup(t.page_key)?.id !== activeGroup) return false;
        if (!q) return true;
        return `${t.title} ${t.description ?? ''} ${pageLabel(t.page_key)}`.toLowerCase().includes(q);
      }),
    [sorted, activeGroup, q]
  );

  // O vídeo aberto: o escolhido, se ainda estiver na lista; senão o primeiro.
  // ?page=... (botão de ajuda da barra superior) abre o primeiro vídeo daquela página.
  const current =
    list.find((t) => t.id === selectedId) ||
    (activePage ? list.find((t) => t.page_key === activePage) : undefined) ||
    list[0];
  const currentId = current ? extractYoutubeId(current.youtube_url) : null;

  const countByGroup = (id: string) => items.filter((t) => getHelpGroup(t.page_key)?.id === id).length;
  const filtering = !!(activeGroup || q);

  function clearFilters() {
    setQuery('');
    setActiveGroup('');
    setParams({});
  }

  // Lista agrupada por categoria (quando não há filtro); sem categoria conhecida vai para "Outros".
  const groupedList = HELP_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    videos: list.filter((t) => getHelpGroup(t.page_key)?.id === g.id),
  }))
    .concat([{ id: 'outros', label: 'Outros', videos: list.filter((t) => !getHelpGroup(t.page_key)) }])
    .filter((g) => g.videos.length > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tutoriais</h1>
          <p className="text-sm text-muted-foreground">Aprenda a usar o sistema, passo a passo.</p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo vídeo
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card className="space-y-2 p-10 text-center">
          <PlayCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Os primeiros vídeos chegam em breve</p>
          <p className="text-sm text-muted-foreground">Estamos gravando os tutoriais. Volte em alguns dias.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Player + descrição */}
          <div className="min-w-0 space-y-4">
            {current ? (
              <>
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-md">
                  {currentId ? (
                    <iframe
                      key={current.id}
                      className="h-full w-full"
                      src={`https://www.youtube.com/embed/${currentId}?rel=0`}
                      title={current.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-white/70">
                      Vídeo indisponível
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{pageLabel(current.page_key)}</Badge>
                    {isSuperAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(current)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remove(current)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold leading-snug sm:text-2xl">{current.title}</h2>
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="mb-1 text-sm font-semibold">Sobre este vídeo</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {current.description || 'Assista ao vídeo para ver o passo a passo.'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <Card className="space-y-2 p-10 text-center">
                <p className="font-medium">Nenhum vídeo encontrado</p>
                <p className="text-sm text-muted-foreground">Tente outra palavra ou escolha outro assunto.</p>
                <div>
                  <Button variant="outline" size="sm" onClick={clearFilters}>Ver todos os vídeos</Button>
                </div>
              </Card>
            )}
          </div>

          {/* Lista de vídeos */}
          <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tutorial"
                className="pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={!activeGroup ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => { setParams({}); setActiveGroup(''); }}
                >
                  Todas ({items.length})
                </Badge>
                {HELP_GROUPS.map((g) => {
                  const n = countByGroup(g.id);
                  return (
                    <Badge
                      key={g.id}
                      variant={activeGroup === g.id ? 'default' : 'outline'}
                      className={n === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                      onClick={() => {
                        if (n === 0) return;
                        setParams({});
                        setActiveGroup(activeGroup === g.id ? '' : g.id);
                      }}
                    >
                      {g.label} ({n})
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{list.length} {list.length === 1 ? 'vídeo' : 'vídeos'}</span>
              {filtering && (
                <button type="button" onClick={clearFilters} className="hover:text-foreground">
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {groupedList.map((g) => (
                <div key={g.id} className="space-y-2">
                  <p className="text-sm font-semibold">
                    {g.label} <span className="font-normal text-muted-foreground">· {g.videos.length}</span>
                  </p>
                  {g.videos.map((t) => {
                    const active = current?.id === t.id;
                    const src = thumb(t.youtube_url);
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedId(t.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedId(t.id)}
                        className={`flex w-full cursor-pointer gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted ${
                          active ? 'border-primary bg-primary/5' : 'bg-card'
                        }`}
                      >
                        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                          {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                            <Play className="h-5 w-5 fill-white text-white" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="text-[11px] text-muted-foreground">{pageLabel(t.page_key)}</p>
                          <p className={`line-clamp-2 text-sm font-medium leading-snug ${active ? 'text-primary' : ''}`}>
                            {t.title}
                          </p>
                          {active && <p className="mt-0.5 text-[11px] font-medium text-primary">Assistindo</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {isSuperAdmin && (
        <TutorialFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
      )}
    </div>
  );
}

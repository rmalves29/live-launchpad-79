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
import { Play, Search, X, Settings2, PlayCircle } from 'lucide-react';

interface Tutorial {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('help_tutorials').select('*').order('sort_order');
      setItems((data as Tutorial[]) || []);
      setLoading(false);
    })();
  }, []);

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
        if (activePage && t.page_key !== activePage) return false;
        if (activeGroup && getHelpGroup(t.page_key)?.id !== activeGroup) return false;
        if (!q) return true;
        return `${t.title} ${t.description ?? ''} ${pageLabel(t.page_key)}`.toLowerCase().includes(q);
      }),
    [sorted, activePage, activeGroup, q]
  );

  // O vídeo aberto: o escolhido, se ainda estiver na lista; senão o primeiro.
  const current = list.find((t) => t.id === selectedId) || list[0];
  const currentId = current ? extractYoutubeId(current.youtube_url) : null;

  const groupsWithVideos = HELP_GROUPS.filter((g) => items.some((t) => getHelpGroup(t.page_key)?.id === g.id));
  const filtering = !!(activePage || activeGroup || q);

  function clearFilters() {
    setQuery('');
    setActiveGroup('');
    setParams({});
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tutoriais</h1>
          <p className="text-sm text-muted-foreground">Aprenda a usar o sistema, passo a passo.</p>
        </div>
        {isSuperAdmin && (
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/tutoriais">
              <Settings2 className="mr-1.5 h-4 w-4" /> Gerenciar vídeos
            </Link>
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
                  <Badge variant="secondary">{pageLabel(current.page_key)}</Badge>
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

            {groupsWithVideos.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={!activeGroup ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => { setParams({}); setActiveGroup(''); }}
                >
                  Todos
                </Badge>
                {groupsWithVideos.map((g) => (
                  <Badge
                    key={g.id}
                    variant={activeGroup === g.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => { setParams({}); setActiveGroup(activeGroup === g.id ? '' : g.id); }}
                  >
                    {g.label}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{list.length} {list.length === 1 ? 'vídeo' : 'vídeos'}</span>
              {filtering && (
                <button type="button" onClick={clearFilters} className="hover:text-foreground">
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {list.map((t, i) => {
                const active = current?.id === t.id;
                const src = thumb(t.youtube_url);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(t.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`flex w-full gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted ${
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
                      <p className="text-[11px] text-muted-foreground">
                        {i + 1}. {pageLabel(t.page_key)}
                      </p>
                      <p className={`line-clamp-2 text-sm font-medium leading-snug ${active ? 'text-primary' : ''}`}>
                        {t.title}
                      </p>
                      {active && <p className="mt-0.5 text-[11px] font-medium text-primary">Assistindo</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

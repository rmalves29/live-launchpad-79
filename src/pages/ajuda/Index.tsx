import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
import { PlayCircle, ArrowLeft, Search, X } from 'lucide-react';

interface Tutorial {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

const pageLabel = (key: string) => ALL_HELP_PAGES.find((p) => p.key === key)?.label || key;

// Miniatura clicável: o player do YouTube só é carregado quando a cliente aperta play.
function VideoCard({ t }: { t: Tutorial }) {
  const [playing, setPlaying] = useState(false);
  const id = extractYoutubeId(t.youtube_url);

  return (
    <Card className="overflow-hidden flex flex-col">
      {id ? (
        <div className="aspect-video bg-black relative">
          {playing ? (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${id}?autoplay=1`}
              title={t.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group w-full h-full relative block"
              aria-label={`Assistir: ${t.title}`}
            >
              <img
                src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
                <PlayCircle className="h-14 w-14 text-white drop-shadow" />
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center text-sm text-muted-foreground">
          Vídeo indisponível
        </div>
      )}
      <div className="p-4 space-y-1.5">
        <Badge variant="secondary" className="text-xs">{pageLabel(t.page_key)}</Badge>
        <h3 className="font-semibold leading-snug">{t.title}</h3>
        {t.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p>
        )}
      </div>
    </Card>
  );
}

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const activePage = params.get('page') || '';
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((t) => {
      if (activePage && t.page_key !== activePage) return false;
      if (!q) return true;
      return `${t.title} ${t.description ?? ''} ${pageLabel(t.page_key)}`.toLowerCase().includes(q);
    });
  }, [sorted, activePage, query]);

  // Agrupa por área; páginas sem grupo conhecido caem em "Outros".
  const sections = useMemo(() => {
    const out: Array<{ id: string; label: string; videos: Tutorial[] }> = [];
    for (const g of HELP_GROUPS) {
      const videos = filtered.filter((t) => getHelpGroup(t.page_key)?.id === g.id);
      if (videos.length) out.push({ id: g.id, label: g.label, videos });
    }
    const rest = filtered.filter((t) => !getHelpGroup(t.page_key));
    if (rest.length) out.push({ id: 'outros', label: 'Outros', videos: rest });
    return out;
  }, [filtered]);

  const pagesWithVideos = useMemo(() => {
    const keys = new Set(items.map((i) => i.page_key));
    return ALL_HELP_PAGES.filter((p) => keys.has(p.key)).sort(
      (a, b) => helpPageRank(a.key) - helpPageRank(b.key)
    );
  }, [items]);

  const showChips = pagesWithVideos.length > 1;
  const flat = !!activePage || !!query.trim();

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Tutoriais</h1>
          <p className="text-sm text-muted-foreground">
            {activePage
              ? `Vídeos sobre ${pageLabel(activePage)}`
              : 'Aprenda a usar cada parte do sistema, passo a passo.'}
          </p>
        </div>
        {activePage && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/ajuda">
              <ArrowLeft className="h-4 w-4 mr-1" /> Ver todos
            </Link>
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar um tutorial (ex: produto, WhatsApp, live)"
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

          {showChips && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={activePage === '' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setParams({})}
              >
                Todos ({items.length})
              </Badge>
              {pagesWithVideos.map((p) => (
                <Badge
                  key={p.key}
                  variant={activePage === p.key ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setParams({ page: p.key })}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <PlayCircle className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">
            {query.trim() ? 'Nenhum tutorial encontrado' : 'Nenhum tutorial disponível ainda'}
          </p>
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? 'Tente outra palavra ou limpe a busca.'
              : activePage
                ? 'Ainda não gravamos vídeos para esta página. Volte em breve!'
                : 'Novos vídeos serão publicados em breve.'}
          </p>
        </Card>
      ) : flat ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <VideoCard key={t.id} t={t} />
          ))}
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.id} className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {s.label}
              <span className="text-xs font-normal text-muted-foreground">
                {s.videos.length} {s.videos.length === 1 ? 'vídeo' : 'vídeos'}
              </span>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {s.videos.map((t) => (
                <VideoCard key={t.id} t={t} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

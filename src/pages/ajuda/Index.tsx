import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ALL_HELP_PAGES,
  HELP_GROUPS,
  extractYoutubeId,
  getHelpGroup,
  helpPageRank,
} from '@/lib/help-page-key';
import {
  Play, Search, X, Rocket, Radio, Package, MessageCircle, Sparkles, ShieldCheck,
  Settings2, ChevronRight, Clock, type LucideIcon,
} from 'lucide-react';

interface Tutorial {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

const GROUP_META: Record<string, { icon: LucideIcon; hint: string; tone: string }> = {
  comece: { icon: Rocket, hint: 'Primeiros passos e configurações', tone: 'from-sky-500 to-blue-600' },
  live: { icon: Radio, hint: 'Vender na live, pedidos e sorteios', tone: 'from-rose-500 to-pink-600' },
  catalogo: { icon: Package, hint: 'Produtos, clientes e relatórios', tone: 'from-amber-500 to-orange-600' },
  whatsapp: { icon: MessageCircle, hint: 'Mensagens, cobranças e fluxos', tone: 'from-emerald-500 to-green-600' },
  ia: { icon: Sparkles, hint: 'Assistentes e automações com IA', tone: 'from-violet-500 to-purple-600' },
  admin: { icon: ShieldCheck, hint: 'Administração do sistema', tone: 'from-slate-500 to-slate-700' },
};

const pageLabel = (key: string) => ALL_HELP_PAGES.find((p) => p.key === key)?.label || key;
const thumb = (url: string) => {
  const id = extractYoutubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
};

function Thumb({ t, className = '' }: { t: Tutorial; className?: string }) {
  const src = thumb(t.youtube_url);
  return (
    <div className={`relative aspect-video overflow-hidden bg-muted ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Vídeo indisponível
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-primary shadow-lg transition-transform group-hover:scale-110">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </div>
    </div>
  );
}

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';
  const activePage = params.get('page') || '';
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [playing, setPlaying] = useState<Tutorial | null>(null);

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

  const countByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of items) {
      const g = getHelpGroup(t.page_key)?.id;
      if (g) m[g] = (m[g] || 0) + 1;
    }
    return m;
  }, [items]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sorted.filter((t) => {
        if (activePage && t.page_key !== activePage) return false;
        if (activeGroup && getHelpGroup(t.page_key)?.id !== activeGroup) return false;
        if (!q) return true;
        return `${t.title} ${t.description ?? ''} ${pageLabel(t.page_key)}`.toLowerCase().includes(q);
      }),
    [sorted, activePage, activeGroup, q]
  );

  const filtering = !!(activePage || activeGroup || q);
  const featured = !filtering ? sorted[0] : undefined;
  const gridItems = featured ? filtered.filter((t) => t.id !== featured.id) : filtered;
  const related = playing
    ? sorted.filter((t) => t.id !== playing.id && t.page_key === playing.page_key).slice(0, 3)
    : [];
  const playingId = playing ? extractYoutubeId(playing.youtube_url) : null;

  function clearFilters() {
    setQuery('');
    setActiveGroup('');
    setParams({});
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 p-6 text-primary-foreground shadow-lg sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-1/3 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-2xl space-y-4">
          <Badge className="border-0 bg-white/20 text-primary-foreground hover:bg-white/20">
            <Play className="mr-1 h-3 w-3 fill-current" /> Central de tutoriais
          </Badge>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Aprenda a usar o sistema, passo a passo
          </h1>
          <p className="text-primary-foreground/85">
            Vídeos curtos e diretos, organizados por assunto. Assista no seu ritmo e volte quando precisar.
          </p>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="O que você quer aprender? (ex: cadastrar produto, WhatsApp, live)"
              className="h-12 border-0 bg-background pl-10 pr-10 text-foreground shadow-md"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {items.length > 0 && (
            <p className="text-sm text-primary-foreground/80">
              {items.length} {items.length === 1 ? 'vídeo disponível' : 'vídeos disponíveis'}
            </p>
          )}
        </div>
        {isSuperAdmin && (
          <Button asChild size="sm" variant="secondary" className="absolute right-4 top-4">
            <Link to="/admin/tutoriais">
              <Settings2 className="mr-1.5 h-4 w-4" /> Gerenciar vídeos
            </Link>
          </Button>
        )}
      </section>

      {/* Áreas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Escolha um assunto</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {HELP_GROUPS.map((g) => {
            const meta = GROUP_META[g.id];
            const Icon = meta.icon;
            const n = countByGroup[g.id] || 0;
            const selected = activeGroup === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setParams({});
                  setActiveGroup(selected ? '' : g.id);
                }}
                className={`group flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  selected ? 'border-primary ring-2 ring-primary/30' : ''
                } ${n === 0 ? 'opacity-60' : ''}`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${meta.tone} text-white`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold leading-tight">{g.label}</span>
                <span className="text-xs text-muted-foreground">
                  {n > 0 ? `${n} ${n === 1 ? 'vídeo' : 'vídeos'}` : 'Em breve'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filtros ativos */}
      {filtering && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando:</span>
          {activeGroup && <Badge variant="secondary">{HELP_GROUPS.find((g) => g.id === activeGroup)?.label}</Badge>}
          {activePage && <Badge variant="secondary">{pageLabel(activePage)}</Badge>}
          {q && <Badge variant="secondary">“{query.trim()}”</Badge>}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpar
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="space-y-2 p-10 text-center">
          <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-medium">
            {items.length === 0 ? 'Os primeiros vídeos chegam em breve' : 'Nenhum vídeo encontrado'}
          </p>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? 'Estamos gravando os tutoriais. Volte em alguns dias.'
              : 'Tente outra palavra ou escolha outro assunto.'}
          </p>
          {items.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Ver todos os vídeos
            </Button>
          )}
        </Card>
      ) : (
        <>
          {featured && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Comece por aqui</h2>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setPlaying(featured)}
                onKeyDown={(e) => e.key === 'Enter' && setPlaying(featured)}
                className="group grid cursor-pointer overflow-hidden transition-shadow hover:shadow-lg md:grid-cols-5"
              >
                <Thumb t={featured} className="md:col-span-3 md:aspect-auto md:min-h-[260px]" />
                <div className="flex flex-col justify-center gap-3 p-6 md:col-span-2">
                  <Badge variant="secondary" className="w-fit">{pageLabel(featured.page_key)}</Badge>
                  <h3 className="text-xl font-semibold leading-snug">{featured.title}</h3>
                  {featured.description && (
                    <p className="line-clamp-4 text-sm text-muted-foreground">{featured.description}</p>
                  )}
                  <span className="inline-flex items-center text-sm font-medium text-primary">
                    Assistir agora <ChevronRight className="ml-0.5 h-4 w-4" />
                  </span>
                </div>
              </Card>
            </section>
          )}

          {gridItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                {filtering ? `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}` : 'Todos os vídeos'}
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {gridItems.map((t) => (
                  <Card
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPlaying(t)}
                    onKeyDown={(e) => e.key === 'Enter' && setPlaying(t)}
                    className="group flex cursor-pointer flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <Thumb t={t} />
                    <div className="space-y-1.5 p-4">
                      <Badge variant="secondary" className="text-xs">{pageLabel(t.page_key)}</Badge>
                      <h3 className="font-semibold leading-snug">{t.title}</h3>
                      {t.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Player */}
      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-3xl gap-4 p-0 sm:rounded-xl">
          {playing && (
            <>
              <div className="aspect-video w-full overflow-hidden bg-black sm:rounded-t-xl">
                {playingId ? (
                  <iframe
                    key={playing.id}
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${playingId}?autoplay=1&rel=0`}
                    title={playing.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/70">
                    Vídeo indisponível
                  </div>
                )}
              </div>
              <DialogHeader className="space-y-2 px-6 text-left">
                <Badge variant="secondary" className="w-fit">{pageLabel(playing.page_key)}</Badge>
                <DialogTitle className="text-xl">{playing.title}</DialogTitle>
                <DialogDescription className="whitespace-pre-wrap">
                  {playing.description || 'Assista ao vídeo para ver o passo a passo.'}
                </DialogDescription>
              </DialogHeader>
              {related.length > 0 && (
                <div className="space-y-2 px-6 pb-6">
                  <p className="text-sm font-medium">Veja também</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {related.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setPlaying(r)}
                        className="group rounded-lg border p-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="line-clamp-2 font-medium">{r.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {related.length === 0 && <div className="pb-2" />}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

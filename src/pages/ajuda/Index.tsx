import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ALL_HELP_PAGES, extractYoutubeId } from '@/lib/help-page-key';
import { PlayCircle, ArrowLeft } from 'lucide-react';

interface Tutorial {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const activePage = params.get('page') || '';
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('help_tutorials')
        .select('*')
        .order('page_key')
        .order('sort_order');
      setItems((data as Tutorial[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => (activePage ? items.filter((t) => t.page_key === activePage) : items),
    [items, activePage]
  );

  const pagesWithVideos = useMemo(() => {
    const keys = new Set(items.map((i) => i.page_key));
    return ALL_HELP_PAGES.filter((p) => keys.has(p.key));
  }, [items]);

  const activeLabel =
    ALL_HELP_PAGES.find((p) => p.key === activePage)?.label || activePage;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground">
            {activePage
              ? `Tutoriais sobre ${activeLabel}`
              : 'Vídeos explicativos de todas as áreas do sistema.'}
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

      {pagesWithVideos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={activePage === '' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setParams({})}
          >
            Todos
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <PlayCircle className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">Nenhum tutorial disponível ainda</p>
          <p className="text-sm text-muted-foreground">
            {activePage
              ? 'Ainda não gravamos vídeos para esta página. Volte em breve!'
              : 'Novos vídeos serão publicados em breve.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((t) => {
            const id = extractYoutubeId(t.youtube_url);
            return (
              <Card key={t.id} className="overflow-hidden">
                {id ? (
                  <div className="aspect-video bg-black">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${id}`}
                      title={t.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center text-sm text-muted-foreground">
                    Vídeo indisponível
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {ALL_HELP_PAGES.find((p) => p.key === t.page_key)?.label || t.page_key}
                    </Badge>
                  </div>
                  <h3 className="font-semibold">{t.title}</h3>
                  {t.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {t.description}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

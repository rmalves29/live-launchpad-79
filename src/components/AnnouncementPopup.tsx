import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  type: 'text' | 'image' | 'video';
  media_url: string | null;
  youtube_url: string | null;
};

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Buscar comunicados ativos
      const nowIso = new Date().toISOString();
      const { data: anns, error } = await supabase
        .from('announcements')
        .select('id,title,body,type,media_url,youtube_url,is_active,starts_at,ends_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error || !anns || cancelled) return;

      const valid = anns.filter((a: any) =>
        (!a.starts_at || a.starts_at <= nowIso) && (!a.ends_at || a.ends_at >= nowIso)
      );
      if (valid.length === 0) return;

      const ids = valid.map((a: any) => a.id);
      const { data: dismissed } = await supabase
        .from('announcement_dismissals')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', ids);
      const dismissedSet = new Set((dismissed || []).map((d: any) => d.announcement_id));
      const next = valid.find((a: any) => !dismissedSet.has(a.id));
      if (next && !cancelled) setCurrent(next as Announcement);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const dismiss = async () => {
    if (!current || !user) return;
    await supabase.from('announcement_dismissals').insert({
      announcement_id: current.id,
      user_id: user.id,
    });
    setCurrent(null);
  };

  if (!current) return null;

  const ytId = current.type === 'video' && current.youtube_url ? extractYouTubeId(current.youtube_url) : null;

  return (
    <Dialog open={!!current} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {current.body && (
            <p className="text-sm text-foreground whitespace-pre-wrap">{current.body}</p>
          )}
          {current.type === 'image' && current.media_url && (
            <img src={current.media_url} alt={current.title} className="w-full rounded-lg" />
          )}
          {current.type === 'video' && ytId && (
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full rounded-lg"
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {current.type === 'video' && !ytId && (
            <p className="text-sm text-destructive">URL de vídeo inválida.</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

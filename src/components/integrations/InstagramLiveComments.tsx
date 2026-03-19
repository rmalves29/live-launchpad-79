import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Radio, Download } from 'lucide-react';
import { toast } from 'sonner';

interface LiveComment {
  id: string;
  username: string | null;
  comment_text: string;
  product_code: string | null;
  product_found: boolean | null;
  is_live: boolean | null;
  created_at: string;
}

interface InstagramLiveCommentsProps {
  tenantId: string;
}

export default function InstagramLiveComments({ tenantId }: InstagramLiveCommentsProps) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('instagram_live_comments')
        .select('id, username, comment_text, product_code, product_found, is_live, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data) setComments(data);
    };
    fetchRecent();
  }, [tenantId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('instagram-live-comments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instagram_live_comments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newComment = payload.new as LiveComment;
          setComments((prev) => {
            const updated = [...prev, newComment];
            return updated.slice(-100);
          });
        }
      )
      .subscribe((status) => {
        setListening(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleClear = async () => {
    const { error } = await supabase
      .from('instagram_live_comments')
      .delete()
      .eq('tenant_id', tenantId);
    if (error) {
      toast.error('Erro ao limpar comentários');
    } else {
      setComments([]);
      toast.success('Comentários limpos');
    }
  };

  const handleSave = () => {
    if (comments.length === 0) {
      toast.error('Nenhum comentário para salvar');
      return;
    }
    const lines = comments.map(c => `@${c.username || 'desconhecido'}: ${c.comment_text}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comentarios-live-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo salvo!');
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">Comentários ao Vivo</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${listening ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span className="text-xs text-muted-foreground">
              {listening ? 'Ouvindo' : 'Conectando...'}
            </span>
          </div>
        </div>
        {comments.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] pr-3">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
              <Radio className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Aguardando comentários da sua Live...</p>
              <p className="text-xs mt-1">Os comentários aparecerão aqui em tempo real</p>
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(c.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        @{c.username || 'desconhecido'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(c.created_at)}
                      </span>
                      {c.product_code && (
                        <Badge variant={c.product_found ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                          {c.product_code}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 break-words">{c.comment_text}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

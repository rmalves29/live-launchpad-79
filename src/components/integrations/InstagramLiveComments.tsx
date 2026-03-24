import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Radio, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InstagramPostComments from './InstagramPostComments';

interface LiveComment {
  id: string;
  username: string | null;
  comment_text: string;
  product_code: string | null;
  product_found: boolean | null;
  comment_status: string | null;
  is_live: boolean | null;
  created_at: string;
}

interface InstagramLiveCommentsProps {
  tenantId: string;
}

const MANIA_DE_MULHER_TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string }> = {
  added: {
    label: 'Adicionado',
    color: '🟢',
    bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  repeat_added: {
    label: 'Comprou outro produto',
    color: '🔵',
    bgClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  not_for_live: {
    label: 'Não cadastrado p/ Live',
    color: '🟣',
    bgClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  out_of_stock: {
    label: 'Estoque esgotado',
    color: '🔴',
    bgClass: 'bg-red-100 text-red-800 border-red-200',
  },
  not_found: {
    label: 'Não encontrado',
    color: '⚪',
    bgClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

function getStatusConfig(status: string | null, productFound: boolean | null) {
  if (status && STATUS_CONFIG[status]) return STATUS_CONFIG[status];
  if (productFound) return STATUS_CONFIG.added;
  return STATUS_CONFIG.not_found;
}

export default function InstagramLiveComments({ tenantId }: InstagramLiveCommentsProps) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [listening, setListening] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const bottomRef = useRef<HTMLDivElement>(null);

  const isManiadeMulher = tenantId === MANIA_DE_MULHER_TENANT_ID;

  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('instagram_live_comments')
        .select('id, username, comment_text, product_code, product_found, comment_status, is_live, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_live', true)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data) setComments(data as LiveComment[]);
    };
    fetchRecent();
  }, [tenantId]);

  useEffect(() => {
    const channel = supabase
      .channel('instagram-live-comments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instagram_live_comments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as LiveComment;
            if (newComment.is_live) {
              setComments((prev) => [...prev, newComment].slice(-100));
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as LiveComment;
            setComments((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
          }
        }
      )
      .subscribe((status) => {
        setListening(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  useEffect(() => {
    if (activeTab === 'live') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments, activeTab]);

  const handleClear = async () => {
    const { error } = await supabase
      .from('instagram_live_comments')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao limpar comentários');
      return;
    }

    setComments([]);
    toast.success('Comentários limpos');
  };

  const handleSave = () => {
    if (comments.length === 0) {
      toast.error('Nenhum comentário para salvar');
      return;
    }

    const lines = comments.map((c) => `@${c.username || 'desconhecido'}: ${c.comment_text}`);
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

  const renderLegend = () => (
    <div className="mb-4 flex flex-wrap gap-3 rounded-lg border bg-muted/50 p-3">
      <span className="mr-1 text-xs font-medium text-muted-foreground">Legenda:</span>
      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="text-xs">{config.color}</span>
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
      ))}
    </div>
  );

  const renderLiveList = () => (
    <ScrollArea className="h-[420px] pr-3">
      {comments.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Radio className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm font-medium">Aguardando comentários da sua Live...</p>
          <p className="mt-1 text-xs">Os comentários aparecerão aqui em tempo real</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => {
            const statusCfg = c.product_code ? getStatusConfig(c.comment_status, c.product_found) : null;

            return (
              <div key={c.id} className="flex items-start gap-2 rounded-md p-2 transition-colors hover:bg-muted/50">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-xs font-bold text-white">
                  {(c.username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">@{c.username || 'desconhecido'}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(c.created_at)}</span>
                    {c.product_code && statusCfg && (
                      <Badge className={`border px-1.5 py-0 text-[10px] ${statusCfg.bgClass}`}>
                        {c.product_code}
                      </Badge>
                    )}
                  </div>
                  <p className="break-words text-sm text-foreground/80">{c.comment_text}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </ScrollArea>
  );

  if (!isManiadeMulher) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Comentários ao Vivo</CardTitle>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${listening ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
              <span className="text-xs text-muted-foreground">{listening ? 'Ouvindo' : 'Conectando...'}</span>
            </div>
          </div>
          {comments.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSave}>
                <Download className="mr-1 h-4 w-4" />
                Salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="mr-1 h-4 w-4" />
                Limpar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {renderLegend()}
          {renderLiveList()}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">Comentários do Instagram</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${listening ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span className="text-xs text-muted-foreground">{listening ? 'Conectado' : 'Conectando...'}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-4 flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="live" className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" />
                Live
              </TabsTrigger>
              <TabsTrigger value="posts" className="flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Todos os Comentários
              </TabsTrigger>
            </TabsList>

            {activeTab === 'live' && comments.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSave}>
                  <Download className="mr-1 h-4 w-4" />
                  Salvar
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Limpar
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="live" className="mt-0">
            {renderLegend()}
            {renderLiveList()}
          </TabsContent>

          <TabsContent value="posts" className="mt-0">
            <InstagramPostComments tenantId={tenantId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Radio, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; textClass: string }> = {
  added: {
    label: 'Adicionado',
    color: '🟢',
    bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    textClass: 'text-emerald-600',
  },
  repeat_added: {
    label: 'Comprou outro produto',
    color: '🔵',
    bgClass: 'bg-blue-100 text-blue-800 border-blue-200',
    textClass: 'text-blue-600',
  },
  not_for_live: {
    label: 'Não cadastrado p/ Live',
    color: '🟣',
    bgClass: 'bg-purple-100 text-purple-800 border-purple-200',
    textClass: 'text-purple-600',
  },
  out_of_stock: {
    label: 'Estoque esgotado',
    color: '🔴',
    bgClass: 'bg-red-100 text-red-800 border-red-200',
    textClass: 'text-red-600',
  },
  not_found: {
    label: 'Não encontrado',
    color: '⚪',
    bgClass: 'bg-gray-100 text-gray-600 border-gray-200',
    textClass: 'text-gray-500',
  },
};

function getStatusConfig(status: string | null, productFound: boolean | null) {
  if (status && STATUS_CONFIG[status]) return STATUS_CONFIG[status];
  if (productFound) return STATUS_CONFIG.added;
  return STATUS_CONFIG.not_found;
}

export default function InstagramLiveComments({ tenantId }: InstagramLiveCommentsProps) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [allComments, setAllComments] = useState<LiveComment[]>([]);
  const [listening, setListening] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const [loadingAll, setLoadingAll] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bottomAllRef = useRef<HTMLDivElement>(null);

  const isManiadeMulher = tenantId === MANIA_DE_MULHER_TENANT_ID;

  // Initial load - live comments
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

  // Load all comments (posts + lives)
  useEffect(() => {
    if (!isManiadeMulher || activeTab !== 'posts') return;
    const fetchAll = async () => {
      setLoadingAll(true);
      const { data } = await supabase
        .from('instagram_live_comments')
        .select('id, username, comment_text, product_code, product_found, comment_status, is_live, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setAllComments(data as LiveComment[]);
      setLoadingAll(false);
    };
    fetchAll();
  }, [tenantId, activeTab, isManiadeMulher]);

  // Realtime subscription
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
            // Add to live tab if is_live
            if (newComment.is_live) {
              setComments((prev) => [...prev, newComment].slice(-100));
            }
            // Add to all comments tab
            setAllComments((prev) => [newComment, ...prev].slice(0, 200));
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as LiveComment;
            setComments((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            setAllComments((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
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

  // Auto-scroll live
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
    } else {
      setComments([]);
      setAllComments([]);
      toast.success('Comentários limpos');
    }
  };

  const handleSave = (data: LiveComment[], prefix: string) => {
    if (data.length === 0) {
      toast.error('Nenhum comentário para salvar');
      return;
    }
    const lines = data.map(c => `@${c.username || 'desconhecido'}: ${c.comment_text}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo salvo!');
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderComment = (c: LiveComment, showDate = false) => {
    const statusCfg = c.product_code
      ? getStatusConfig(c.comment_status, c.product_found)
      : null;

    return (
      <div key={c.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {(c.username || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              @{c.username || 'desconhecido'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {showDate ? formatDateTime(c.created_at) : formatTime(c.created_at)}
            </span>
            {c.is_live && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-200 text-red-500">
                LIVE
              </Badge>
            )}
            {c.product_code && statusCfg && (
              <Badge className={`text-[10px] px-1.5 py-0 border ${statusCfg.bgClass}`}>
                {c.product_code}
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground/80 break-words">{c.comment_text}</p>
        </div>
      </div>
    );
  };

  const renderLegend = () => (
    <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/50 border">
      <span className="text-xs font-medium text-muted-foreground mr-1">Legenda:</span>
      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="text-xs">{config.color}</span>
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
      ))}
    </div>
  );

  // If not Mania de Mulher, show only live comments (original behavior)
  if (!isManiadeMulher) {
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleSave(comments, 'comentarios-live')}>
                <Download className="h-4 w-4 mr-1" />
                Salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {renderLegend()}
          <ScrollArea className="h-[420px] pr-3">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
                <Radio className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Aguardando comentários da sua Live...</p>
                <p className="text-xs mt-1">Os comentários aparecerão aqui em tempo real</p>
              </div>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => renderComment(c))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // Mania de Mulher - show tabs with live + all post comments
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">Comentários do Instagram</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${listening ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span className="text-xs text-muted-foreground">
              {listening ? 'Conectado' : 'Conectando...'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
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
            <div className="flex gap-2">
              {activeTab === 'live' && comments.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleSave(comments, 'comentarios-live')}>
                    <Download className="h-4 w-4 mr-1" />
                    Salvar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClear}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                </>
              )}
              {activeTab === 'posts' && allComments.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => handleSave(allComments, 'todos-comentarios')}>
                  <Download className="h-4 w-4 mr-1" />
                  Salvar
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="live" className="mt-0">
            {renderLegend()}
            <ScrollArea className="h-[420px] pr-3">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
                  <Radio className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm font-medium">Aguardando comentários da sua Live...</p>
                  <p className="text-xs mt-1">Os comentários aparecerão aqui em tempo real</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => renderComment(c))}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="posts" className="mt-0">
            {renderLegend()}
            <ScrollArea className="h-[420px] pr-3">
              {loadingAll ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <p className="text-sm">Carregando comentários...</p>
                </div>
              ) : allComments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm font-medium">Nenhum comentário recebido ainda</p>
                  <p className="text-xs mt-1">Comentários das suas postagens e lives aparecerão aqui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allComments.map((c) => renderComment(c, true))}
                  <div ref={bottomAllRef} />
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

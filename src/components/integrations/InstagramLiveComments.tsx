import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Radio, Download, FlaskConical, Send } from 'lucide-react';
import { toast } from 'sonner';

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
  // Fallback for old records without comment_status
  if (productFound) return STATUS_CONFIG.added;
  return STATUS_CONFIG.not_found;
}

export default function InstagramLiveComments({ tenantId }: InstagramLiveCommentsProps) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [listening, setListening] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testUsername, setTestUsername] = useState('');
  const [testComment, setTestComment] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('instagram_live_comments')
        .select('id, username, comment_text, product_code, product_found, comment_status, is_live, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data) setComments(data as LiveComment[]);
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
          event: '*',
          schema: 'public',
          table: 'instagram_live_comments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as LiveComment;
            setComments((prev) => {
              const updated = [...prev, newComment];
              return updated.slice(-100);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as LiveComment;
            setComments((prev) =>
              prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            );
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

  const SAMPLE_COMMENTS = [
    { username: 'maria_silva', text: 'Amei esse produto! ABC123', code: 'ABC123' },
    { username: 'ana_costa', text: 'Quero esse! DEF456', code: 'DEF456' },
    { username: 'julia_santos', text: 'Que lindo 😍', code: null },
    { username: 'carol_oliveira', text: 'Tem no tamanho M? GHI789', code: 'GHI789' },
    { username: 'beatriz_lima', text: '🔥🔥🔥', code: null },
  ];

  const handleSendTestComment = async (username?: string, text?: string, code?: string | null) => {
    const finalUsername = username || testUsername || 'test_user';
    const finalText = text || testComment || 'Comentário de teste';
    
    if (!finalText.trim()) {
      toast.error('Digite um comentário');
      return;
    }

    setSendingTest(true);
    try {
      // Extract product code from comment if not provided
      const codeMatch = finalText.match(/\b([A-Za-z]{2,4}[-]?[0-9]{2,6})\b/i);
      const productCode = code !== undefined ? code : (codeMatch ? codeMatch[1].toUpperCase() : null);

      const { error } = await supabase
        .from('instagram_live_comments')
        .insert({
          tenant_id: tenantId,
          instagram_user_id: `test_${Date.now()}`,
          username: finalUsername,
          comment_text: finalText,
          product_code: productCode,
          product_found: productCode ? Math.random() > 0.3 : null,
          comment_status: productCode 
            ? ['added', 'repeat_added', 'not_for_live', 'out_of_stock', 'not_found'][Math.floor(Math.random() * 5)]
            : null,
          is_live: true,
          media_id: `test_media_${Date.now()}`,
        } as any);

      if (error) throw error;
      toast.success('Comentário de teste enviado!');
      setTestComment('');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar comentário de teste');
    } finally {
      setSendingTest(false);
    }
  };

  const handleBurstTest = async () => {
    setSendingTest(true);
    for (const sample of SAMPLE_COMMENTS) {
      await handleSendTestComment(sample.username, sample.text, sample.code);
      await new Promise(r => setTimeout(r, 800));
    }
    setSendingTest(false);
  };

  return (
    <div className="space-y-4">
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
            <Button variant="outline" size="sm" onClick={handleSave}>
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
        {/* Legenda de cores */}
        <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/50 border">
          <span className="text-xs font-medium text-muted-foreground mr-1">Legenda:</span>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-xs">{config.color}</span>
              <span className="text-xs text-muted-foreground">{config.label}</span>
            </div>
          ))}
        </div>

        <ScrollArea className="h-[420px] pr-3">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
              <Radio className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Aguardando comentários da sua Live...</p>
              <p className="text-xs mt-1">Os comentários aparecerão aqui em tempo real</p>
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => {
                const statusCfg = c.product_code
                  ? getStatusConfig(c.comment_status, c.product_found)
                  : null;

                return (
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
                        {c.product_code && statusCfg && (
                          <Badge
                            className={`text-[10px] px-1.5 py-0 border ${statusCfg.bgClass}`}
                          >
                            {c.product_code}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground/80 break-words">{c.comment_text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>

    {/* Painel de Teste */}
    <Card className="border-dashed border-amber-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Simulador de Comentários (Teste)</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTestPanel(!showTestPanel)}
          >
            {showTestPanel ? 'Ocultar' : 'Abrir'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use este painel para simular comentários e testar a funcionalidade antes da aprovação do Meta
        </p>
      </CardHeader>
      {showTestPanel && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
              <Input
                placeholder="@usuario_teste"
                value={testUsername}
                onChange={(e) => setTestUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Comentário</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Quero esse! ABC123"
                  value={testComment}
                  onChange={(e) => setTestComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendTestComment()}
                />
                <Button
                  size="icon"
                  onClick={() => handleSendTestComment()}
                  disabled={sendingTest}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBurstTest}
              disabled={sendingTest}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <FlaskConical className="h-4 w-4 mr-1" />
              Simular 5 comentários automáticos
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            💡 <strong>Dica:</strong> Inclua um código de produto no comentário (ex: <code className="bg-muted px-1 rounded">ABC123</code>) para testar a detecção automática.
            Os status são atribuídos aleatoriamente para demonstração.
          </p>
        </CardContent>
      )}
    </Card>
    </div>
  );
}

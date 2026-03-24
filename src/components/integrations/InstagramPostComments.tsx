import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, ExternalLink, RefreshCw, Instagram, Send, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useState } from 'react';

interface InstagramPostComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
}

interface InstagramPost {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
  comments: InstagramPostComment[];
}

interface InstagramPostCommentsProps {
  tenantId: string;
}

interface InstagramPostCommentsResponse {
  account_username?: string | null;
  posts: InstagramPost[];
}

export default function InstagramPostComments({ tenantId }: InstagramPostCommentsProps) {
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; postId: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['instagram-post-comments', tenantId],
    queryFn: async () => {
      const response = await supabase.functions.invoke('instagram-post-comments', {
        body: { tenant_id: tenantId },
      });

      if (response.error) {
        throw response.error;
      }

      return response.data as InstagramPostCommentsResponse;
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60,
  });

  const posts = data?.posts ?? [];

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      console.error(result.error);
      toast.error('Não foi possível atualizar os comentários das postagens');
      return;
    }

    toast.success('Comentários das postagens atualizados');
  };

  const handleReply = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setSending(true);
    try {
      const response = await supabase.functions.invoke('instagram-post-comments', {
        body: {
          tenant_id: tenantId,
          action: 'reply',
          comment_id: replyingTo.commentId,
          media_id: replyingTo.postId,
          message: replyText.trim(),
        },
      });
      if (response.error || response.data?.error) {
        toast.error(response.data?.error || 'Erro ao responder comentário');
      } else {
        toast.success('Resposta enviada com sucesso!');
        setReplyText('');
        setReplyingTo(null);
        refetch();
      }
    } catch {
      toast.error('Erro ao enviar resposta');
    } finally {
      setSending(false);
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando postagens...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Não foi possível carregar as postagens e comentários do Instagram.
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Instagram className="mb-3 h-10 w-10 opacity-40" />
        <p className="text-sm font-medium">Nenhuma postagem encontrada</p>
        <p className="mt-1 text-xs">Quando houver posts no Instagram, eles aparecerão aqui com seus comentários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-foreground">Posts e comentários da conta</p>
          <p className="text-xs text-muted-foreground">
            {data?.account_username ? `@${data.account_username}` : 'Instagram conectado'} • {posts.length} postagens carregadas
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <ScrollArea className="h-[420px] pr-3">
        <div className="space-y-4">
          {posts.map((post) => {
            const previewImage = post.thumbnail_url || post.media_url;

            return (
              <Card key={post.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt={post.caption ? `Prévia da postagem: ${post.caption.slice(0, 60)}` : 'Prévia da postagem do Instagram'}
                        className="h-16 w-16 rounded-md border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                        <Instagram className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{post.media_type || 'POST'}</Badge>
                        <Badge variant="outline">
                          <MessageCircle className="mr-1 h-3 w-3" />
                          {post.comments.length} comentário{post.comments.length === 1 ? '' : 's'}
                        </Badge>
                        {post.timestamp && (
                          <span className="text-xs text-muted-foreground">{formatDateTime(post.timestamp)}</span>
                        )}
                      </div>

                      <p className="text-sm text-foreground/85 break-words">
                        {post.caption?.trim() || 'Postagem sem legenda.'}
                      </p>

                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir postagem
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    {post.comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Esta postagem ainda não recebeu comentários.</p>
                    ) : (
                      post.comments.map((comment) => (
                        <div key={comment.id} className="rounded-md bg-muted/50 p-3 group">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              @{comment.username || 'desconhecido'}
                            </span>
                            {comment.timestamp && (
                              <span className="text-[11px] text-muted-foreground">{formatDateTime(comment.timestamp)}</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setReplyingTo({ commentId: comment.id, postId: post.id });
                                setReplyText('');
                              }}
                            >
                              <Send className="mr-1 h-3 w-3" />
                              Responder
                            </Button>
                          </div>
                          <p className="mt-1 text-sm text-foreground/80 break-words">{comment.text || 'Comentário sem texto.'}</p>

                          {replyingTo?.commentId === comment.id && (
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                placeholder="Digite sua resposta..."
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !sending && handleReply()}
                                className="h-8 text-sm"
                                autoFocus
                              />
                              <Button size="sm" className="h-8" onClick={handleReply} disabled={sending || !replyText.trim()}>
                                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => setReplyingTo(null)}>
                                ✕
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

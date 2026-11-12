import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Music2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { cleanHandle } from '@/lib/social-handle';

// Link da bio do TikTok: a cliente liga o @ dela ao WhatsApp (só dois campos, para voltar rápido para a live).
// O cadastro passa pela edge function tiktok-register, que também manda o resumo do pedido pelo WhatsApp da loja.
export default function CadastroTikTok() {
  const { slug } = useParams<{ slug: string }>();
  const normalizedSlug = decodeURIComponent(slug || '').trim().toLowerCase();
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [tiktok, setTiktok] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ ordersLinked: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!normalizedSlug) {
        setTenantError('Loja não especificada');
        setLoadingTenant(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('get_tenant_by_slug' as any, { slug_param: normalizedSlug });
        if (error) throw error;
        const t = Array.isArray(data) ? data[0] : data;
        if (!t) setTenantError('Loja não encontrada');
        else setTenantName(t.name);
      } catch {
        setTenantError('Erro ao carregar dados da loja');
      } finally {
        setLoadingTenant(false);
      }
    };
    load();
  }, [normalizedSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTiktok = cleanHandle(tiktok).toLowerCase();
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanTiktok || !/^[a-z0-9._]+$/.test(cleanTiktok)) {
      toast.error('Informe seu @ do TikTok');
      return;
    }
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      toast.error('Informe seu WhatsApp com DDD');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('tiktok-register', {
        body: { tenant_slug: normalizedSlug, tiktok: cleanTiktok, phone: cleanPhone },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao cadastrar');
      setSuccess({ ordersLinked: Number(data.orders_linked) || 0 });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingTenant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenantError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">{tenantError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Sonner />
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center text-foreground">{tenantName}</h1>

        {success ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">Pronto!</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {success.ordersLinked > 0
                    ? 'Seu pedido da live está garantido e o resumo já foi para o seu WhatsApp. Pode voltar para a live!'
                    : 'Pode voltar para a live e comentar o código do produto.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 rounded-lg bg-foreground">
                  <Music2 className="h-6 w-6 text-background" />
                </div>
              </div>
              <CardTitle>Comprar na live do TikTok</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cadastre uma vez e seus pedidos da live chegam direto no seu WhatsApp.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tiktok">Seu @ do TikTok *</Label>
                  <Input
                    id="tiktok"
                    placeholder="@seuusuario"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp com DDD *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="(31) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Cadastrar e voltar para a live
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

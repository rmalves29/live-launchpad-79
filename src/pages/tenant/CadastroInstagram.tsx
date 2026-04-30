import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Instagram, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
}

export default function CadastroInstagram() {
  const { slug } = useParams<{ slug: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadTenant = async () => {
      if (!slug) {
        setTenantError('Loja não especificada');
        setLoadingTenant(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('tenants')
          .select('id, name, slug, logo_url, primary_color')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setTenantError('Loja não encontrada');
        } else {
          setTenant(data);
        }
      } catch {
        setTenantError('Erro ao carregar dados da loja');
      } finally {
        setLoadingTenant(false);
      }
    };
    loadTenant();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanInstagram = instagram.replace(/^@/, '').trim();
    const cleanPhone = phone.replace(/\D/g, '').trim();

    if (!cleanInstagram) {
      toast.error('Informe seu @ do Instagram');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error('Informe um telefone válido');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('public_register_instagram' as any, {
        p_tenant_slug: slug,
        p_instagram: cleanInstagram,
        p_phone: cleanPhone,
        p_name: name.trim() || null,
      });

      if (error) throw error;

      const result = data as any;
      if (result && !result.success) {
        throw new Error(result.error || 'Erro ao cadastrar');
      }

      if (result?.updated) {
        setSuccess(true);
        toast.success('Cadastro atualizado!');
      } else {
        setSuccess(true);
        toast.success('Cadastro realizado com sucesso!');
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      toast.error(err?.message || 'Erro ao realizar cadastro. Tente novamente.');
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

  if (tenantError || !tenant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">{tenantError || 'Loja não encontrada'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Sonner />
      <div className="w-full max-w-md space-y-6">
        {tenant.logo_url && (
          <div className="flex justify-center">
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="h-20 w-auto object-contain drop-shadow-md"
            />
          </div>
        )}

        {!tenant.logo_url && (
          <h1 className="text-2xl font-bold text-center text-foreground">{tenant.name}</h1>
        )}

        {success ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">Cadastro realizado!</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Seu Instagram foi vinculado ao seu telefone com sucesso. Agora seus pedidos da Live serão identificados automaticamente.
                </p>
              </div>
              <Button variant="outline" onClick={() => { setSuccess(false); setInstagram(''); setPhone(''); setName(''); }}>
                Cadastrar outro
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                  <Instagram className="h-6 w-6 text-white" />
                </div>
              </div>
              <CardTitle>Cadastro Instagram</CardTitle>
              <p className="text-sm text-muted-foreground">
                Vincule seu @ do Instagram ao seu telefone para agilizar seus pedidos nas Lives.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram">@ do Instagram *</Label>
                  <Input
                    id="instagram"
                    placeholder="@seuusuario"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
                  <Input
                    id="phone"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome (opcional)</Label>
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Cadastrar
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

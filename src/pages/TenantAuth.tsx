import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTenantContext } from "@/contexts/TenantContext";
import { Building2, Shield } from "lucide-react";
import orderZapsLogo from '@/assets/order-zaps-logo.png';

export default function TenantAuth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useTenantContext();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = tenant ? `Login - ${tenant.name}` : "Login - Sistema";
  }, [tenant]);

  const handleLogin = async () => {
    if (!tenant) {
      toast({ 
        title: "Erro", 
        description: "Empresa não identificada. Recarregue a página.", 
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    try {
      // Fazer login no Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (authError) throw authError;

      // Verificar se o usuário pertence a este tenant
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', authData.user.id)
        .single();

      if (profileError) throw profileError;

      // Super admin pode acessar qualquer tenant
      if (profile.role === 'super_admin') {
        toast({ 
          title: "Bem-vindo Super Admin!", 
          description: `Acesso liberado para ${tenant.name}` 
        });
        navigate("/", { replace: true });
        return;
      }

      // Verificar se o usuário pertence a este tenant
      if (profile.tenant_id !== tenant.id) {
        await supabase.auth.signOut();
        toast({ 
          title: "Acesso negado", 
          description: "Este usuário não tem permissão para acessar esta empresa.", 
          variant: "destructive" 
        });
        return;
      }

      // Salvar timestamp do último acesso para controle de timeout
      localStorage.setItem('lastActivity', Date.now().toString());
      
      toast({ 
        title: "Bem-vindo!", 
        description: `Acesso liberado para ${tenant.name}` 
      });
      navigate("/", { replace: true });
      
    } catch (err: any) {
      toast({ 
        title: "Erro ao entrar", 
        description: err.message || "Verifique suas credenciais.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Building2 className="h-12 w-12 text-primary animate-pulse mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Shield className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Empresa não encontrada</h2>
            <p className="text-muted-foreground text-center">
              Verifique se o endereço está correto
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <main className="w-full max-w-md p-4">
        <div className="flex justify-center mb-6">
          <img 
            src={orderZapsLogo} 
            alt="Order Zaps" 
            className="h-[100px] w-[100px] object-contain"
          />
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Building2 className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">{tenant.name}</CardTitle>
            <p className="text-muted-foreground">Entre com suas credenciais</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="seu@email.com"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>

            <div className="text-center text-sm text-muted-foreground mt-4">
              <p>Acesso restrito aos usuários autorizados de {tenant.name}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
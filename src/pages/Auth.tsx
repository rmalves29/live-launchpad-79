import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Zap, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/relatorios";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    document.title = mode === "login" ? "Entrar - Sistema" : "Criar conta - Sistema";
  }, [mode]);

  const checkTenantAccess = async (userId: string): Promise<{ allowed: boolean; reason?: string }> => {
    try {
      // Buscar o perfil do usuário para saber o tenant_id e role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      // Super admin sempre tem acesso
      if (profile?.role === 'super_admin') {
        return { allowed: true };
      }

      // Se não tem tenant_id, não tem acesso
      if (!profile?.tenant_id) {
        return { allowed: false, reason: 'Usuário não está associado a nenhuma empresa.' };
      }

      // Buscar dados da tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, is_active, is_blocked, subscription_ends_at')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;

      if (!tenant) {
        return { allowed: false, reason: 'Empresa não encontrada no sistema.' };
      }

      // Verificar se a empresa está inativa
      if (!tenant.is_active) {
        return { 
          allowed: false, 
          reason: `A empresa "${tenant.name}" está desativada. Entre em contato com o suporte para reativar o acesso.` 
        };
      }

      // Verificar se a empresa está bloqueada manualmente
      if (tenant.is_blocked) {
        return { 
          allowed: false, 
          reason: `A empresa "${tenant.name}" foi bloqueada. Entre em contato com o suporte para mais informações.` 
        };
      }

      // Verificar se a assinatura expirou
      if (tenant.subscription_ends_at) {
        const expirationDate = new Date(tenant.subscription_ends_at);
        const now = new Date();
        
        if (expirationDate < now) {
          return { 
            allowed: false, 
            reason: `O prazo de acesso da empresa "${tenant.name}" expirou. Entre em contato com o suporte para renovar sua assinatura.` 
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Erro ao verificar acesso da tenant:', error);
      return { allowed: false, reason: 'Erro ao verificar permissões de acesso.' };
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setAccessError(null);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Verificar se a tenant do usuário tem acesso
      if (data.user) {
        const accessCheck = await checkTenantAccess(data.user.id);
        
        if (!accessCheck.allowed) {
          // Fazer logout imediatamente
          await supabase.auth.signOut();
          setAccessError(accessCheck.reason || 'Acesso negado.');
          return;
        }
      }

      toast({ title: "Bem-vindo!", description: "Login realizado com sucesso." });
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      const isInvalidCreds = msg.includes('invalid login credentials') || msg.includes('invalid login');

      if (isInvalidCreds) {
        toast({ title: 'Credenciais inválidas', description: 'Verifique seu e-mail e senha. Use "Esqueci minha senha" para redefinir.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Erro ao entrar', description: err.message || 'Verifique suas credenciais.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      toast({ title: "Cadastro realizado!", description: "Você já pode fazer login com suas credenciais." });
      setMode("login");
    } catch (err: any) {
      toast({ title: "Erro no cadastro", description: err.message || "Tente novamente mais tarde.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Use Supabase's built-in password reset flow
  const handlePasswordReset = async () => {
    if (!email) {
      toast({ title: "Erro", description: "Por favor, insira seu e-mail.", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada para redefinir sua senha." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar e-mail", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <main className="w-full max-w-md p-4">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3 bg-gradient-to-r from-primary/10 to-accent/10 px-5 py-3 rounded-2xl border border-primary/20">
            <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl shadow-lg">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-display font-bold text-gradient-primary">OrderZap</span>
              <span className="text-xs text-muted-foreground -mt-1">Gestão Inteligente</span>
            </div>
          </div>
        </div>

        {/* Mensagem de erro de acesso */}
        {accessError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Acesso Bloqueado</AlertTitle>
            <AlertDescription className="mt-2">
              <p>{accessError}</p>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {mode === "login" ? "Entrar" : "Criar conta"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAccessError(null);
                }} 
                placeholder="seu@email.com" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAccessError(null);
                }} 
                placeholder="••••••••" 
              />
            </div>

            {mode === "login" ? (
              <>
                <Button className="w-full" onClick={handleLogin} disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="text-xs underline text-muted-foreground mt-2"
                    disabled={loading || !email}
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </>
            ) : (
              <Button className="w-full" onClick={handleSignup} disabled={loading}>
                {loading ? "Criando..." : "Criar conta"}
              </Button>
            )}

            <div className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Não tem conta? {" "}
                  <button className="underline" onClick={() => setMode("signup")}>Cadastre-se</button>
                </>
              ) : (
                <>
                  Já tem conta? {" "}
                  <button className="underline" onClick={() => setMode("login")}>Entrar</button>
                </>
              )}
            </div>

            <div className="text-center">
              <Link to="/" className="text-sm underline">Voltar ao início</Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

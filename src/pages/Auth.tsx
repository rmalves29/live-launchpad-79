import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation, Link } from "react-router-dom";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = mode === "login" ? "Entrar - Sistema" : "Criar conta - Sistema";
  }, [mode]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "Bem-vindo!", description: "Login realizado com sucesso." });
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      const isInvalidCreds = msg.includes('invalid login credentials') || msg.includes('invalid login');
      const isMasterEmail = email.trim().toLowerCase() === 'rmalves21@hotmail.com';

      if (isInvalidCreds && isMasterEmail) {
        toast({ title: 'Corrigindo acesso...', description: 'Detectamos erro de credenciais. Vamos ajustar seu usuário master automaticamente.' });
        await handleForceReset();
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

  // Ajuda de emergência: redefine a senha no servidor (apenas para o e-mail master permitido)
  const handleForceReset = async () => {
    try {
      setLoading(true);
      const newPassword = password || "mulher2020*";
      const { error } = await supabase.functions.invoke("admin-set-password", {
        body: { email, newPassword },
      });
      if (error) throw error;
      toast({ title: "Senha redefinida", description: "Tentando entrar..." });

      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: newPassword });
      if (loginError) throw loginError;

      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: "Falha ao corrigir login", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <main className="w-full max-w-md p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {mode === "login" ? "Entrar" : "Criar conta"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {mode === "login" ? (
              <>
                <Button className="w-full" onClick={handleLogin} disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleForceReset}
                    className="text-xs underline text-muted-foreground mt-2"
                    disabled={loading || !email}
                  >
                    Problemas para entrar? Corrigir automaticamente
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

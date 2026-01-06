import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Zap } from "lucide-react";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/relatorios";

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

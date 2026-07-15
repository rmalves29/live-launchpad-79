import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Zap, AlertTriangle } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase redireciona com tokens no hash (#access_token=...&type=recovery)
    // O client detecta e cria sessão automaticamente (detectSessionInUrl).
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    const errDesc = params.get("error_description");

    if (errDesc) {
      setError(decodeURIComponent(errDesc));
      return;
    }

    // Aguarda o Supabase processar o hash e emitir PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    // Fallback: se já houver sessão (link já processado)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && (type === "recovery" || !type)) setReady(true);
    });

    // Se não há hash de recuperação nem sessão, mostrar erro após 1.5s
    const t = setTimeout(() => {
      if (!hash.includes("access_token") && !hash.includes("type=recovery")) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) setError("Link de recuperação inválido ou expirado. Solicite um novo em 'Esqueci minha senha'.");
        });
      }
    }, 1500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async () => {
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Use pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas não coincidem", description: "Verifique a confirmação.", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada", description: "Faça login com sua nova senha." });
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar senha", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <main className="w-full max-w-md p-4">
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3 bg-gradient-to-r from-primary/10 to-accent/10 px-5 py-3 rounded-2xl border border-primary/20">
            <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl shadow-lg">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-display font-bold text-gradient-primary">OrderZap</span>
              <span className="text-xs text-muted-foreground -mt-1">Redefinir Senha</span>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Link inválido</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/auth")}>
                Voltar para login
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Definir nova senha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!ready ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Validando link de recuperação...
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Nova senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirmar senha</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    />
                  </div>
                  <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                    {loading ? "Atualizando..." : "Atualizar senha"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

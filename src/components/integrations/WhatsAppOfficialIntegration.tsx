import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, CheckCircle2, AlertTriangle, Link2, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

export default function WhatsAppOfficialIntegration() {
  const { tenant } = useTenantContext();
  const tenantId = tenant?.id;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Trata retorno do OAuth
  useEffect(() => {
    const success = searchParams.get("whatsapp_success");
    const err = searchParams.get("whatsapp_error");

    if (success === "true") {
      toast.success("WhatsApp conectado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-official", tenantId] });
      searchParams.delete("whatsapp_success");
      setSearchParams(searchParams, { replace: true });
    }
    if (err) {
      const messages: Record<string, string> = {
        codigo_nao_fornecido: "Código de autorização não fornecido",
        tenant_nao_identificado: "Tenant não identificado",
        credenciais_nao_configuradas: "Credenciais do app Meta não configuradas",
        falha_token: "Falha ao obter token de acesso",
        nenhuma_waba_encontrada: "Nenhuma conta WhatsApp Business encontrada",
        nenhum_numero_encontrado: "Nenhum número de telefone encontrado nesta WABA",
        erro_salvar: "Erro ao salvar credenciais",
      };
      toast.error(messages[err] || `Erro: ${err}`);
      searchParams.delete("whatsapp_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient, tenantId]);

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-official", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_whatsapp_official" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!tenantId,
  });

  const { data: tenantRow } = useQuery({
    queryKey: ["tenant-whatsapp-provider", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("whatsapp_provider")
        .eq("id", tenantId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!tenantId,
  });

  const provider: "zapi" | "official" = tenantRow?.whatsapp_provider || "zapi";
  const isConnected = !!(config?.is_active && config?.access_token);

  const connect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-official-oauth-url", {
        body: { tenantId },
      });
      if (error || !data?.url) {
        toast.error("Erro ao gerar URL de autorização");
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao iniciar conexão");
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("integration_whatsapp_official" as any)
        .update({ is_active: false, access_token: null, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      // Volta canal para Z-API se estava em official
      if (provider === "official") {
        await supabase.from("tenants").update({ whatsapp_provider: "zapi" } as any).eq("id", tenantId!);
      }
    },
    onSuccess: () => {
      toast.success("WhatsApp desconectado");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-official", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenant-whatsapp-provider", tenantId] });
    },
    onError: () => toast.error("Erro ao desconectar"),
  });

  const providerMutation = useMutation({
    mutationFn: async (val: "zapi" | "official") => {
      const { error } = await supabase.from("tenants").update({ whatsapp_provider: val } as any).eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: (_, val) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-whatsapp-provider", tenantId] });
      toast.success(`Canal 1:1 alterado para ${val === "official" ? "API Oficial" : "Z-API"}`);
    },
    onError: () => toast.error("Erro ao alterar canal"),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          A <strong>Z-API permanece sempre conectada</strong> para leitura de grupos e mensagens recebidas.
          A API Oficial afeta apenas o <strong>envio individual (1:1)</strong>. Grupos continuam pela Z-API.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle>WhatsApp Business API (Meta)</CardTitle>
                <CardDescription>Conecte sua conta WhatsApp Business oficial</CardDescription>
              </div>
            </div>
            {isConnected ? (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Conectado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">Desconectado</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Número: <span className="font-medium text-foreground">{config?.display_phone_number || "—"}</span>
                  </p>
                  {config?.verified_name && (
                    <p className="text-sm text-muted-foreground">
                      Conta: <span className="font-medium text-foreground">{config.verified_name}</span>
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                  {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Desconectar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={connect}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Conectar WhatsApp Business
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Você será redirecionado para o Facebook para autorizar e escolher sua conta WhatsApp Business
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Canal de envio 1:1
              <Badge variant={provider === "official" ? "default" : "secondary"}>
                {provider === "official" ? "API Oficial Meta" : "Z-API"}
              </Badge>
            </CardTitle>
            <CardDescription>Define quem envia as mensagens individuais para clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={provider} onValueChange={(v) => providerMutation.mutate(v as any)}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zapi">Z-API (padrão)</SelectItem>
                <SelectItem value="official">API Oficial Meta</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

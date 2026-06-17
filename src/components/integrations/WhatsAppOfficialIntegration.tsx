import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Copy, CheckCircle2, AlertCircle, Loader2, Save, TestTube2 } from "lucide-react";

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export default function WhatsAppOfficialIntegration() {
  const { tenant } = useTenantContext();
  const tenantId = tenant?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    app_id: "",
    is_active: false,
    webhook_verify_token: "",
    display_phone_number: "",
    verified_name: "",
  });
  const [provider, setProvider] = useState<"zapi" | "official">("zapi");

  const webhookUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-official-webhook`;

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      const [{ data: integ }, { data: tenantRow }] = await Promise.all([
        supabase.from("integration_whatsapp_official" as any).select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("tenants").select("whatsapp_provider").eq("id", tenantId).maybeSingle(),
      ]);
      if (integ) setForm({ ...(integ as any) });
      if ((tenantRow as any)?.whatsapp_provider) setProvider((tenantRow as any).whatsapp_provider);
      setLoading(false);
    })();
  }, [tenantId]);

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    const payload = {
      tenant_id: tenantId,
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim(),
      access_token: form.access_token.trim(),
      app_id: form.app_id.trim() || null,
      is_active: form.is_active,
    };
    const { error } = await supabase
      .from("integration_whatsapp_official" as any)
      .upsert(payload, { onConflict: "tenant_id" });
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      // Re-fetch para pegar webhook_verify_token gerado
      const { data: integ } = await supabase
        .from("integration_whatsapp_official" as any).select("*").eq("tenant_id", tenantId).maybeSingle();
      if (integ) setForm({ ...(integ as any) });
      toast.success("Credenciais salvas");
    }
    setSaving(false);
  };

  const updateProvider = async (val: "zapi" | "official") => {
    if (!tenantId) return;
    setProvider(val);
    const { error } = await supabase.from("tenants").update({ whatsapp_provider: val } as any).eq("id", tenantId);
    if (error) toast.error("Erro: " + error.message);
    else toast.success(`Canal de envio 1:1 alterado para ${val === "official" ? "API Oficial" : "Z-API"}`);
  };

  const testConnection = async () => {
    if (!tenantId) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-official-templates", {
      body: { tenant_id: tenantId, action: "test_connection" },
    });
    if (error || !data?.success) {
      toast.error("Falha: " + (data?.data?.error?.message || error?.message || "desconhecido"));
    } else {
      toast.success(`Conectado: ${data.data?.name || data.data?.id}`);
    }
    setTesting(false);
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success("Copiado");
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          A <strong>Z-API permanece sempre conectada</strong> para leitura de grupos e mensagens recebidas.
          A escolha abaixo afeta apenas o <strong>canal de envio individual (1:1)</strong> para clientes.
          Envios em grupos do WhatsApp continuam sempre pela Z-API (API oficial não suporta grupos).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Canal de envio 1:1
            <Badge variant={provider === "official" ? "default" : "secondary"}>
              {provider === "official" ? "API Oficial Meta" : "Z-API"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={provider} onValueChange={(v) => updateProvider(v as any)}>
            <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="zapi">Z-API (padrão)</SelectItem>
              <SelectItem value="official">API Oficial Meta</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais Meta Cloud API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Phone Number ID *</Label>
              <Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} />
            </div>
            <div>
              <Label>WABA ID *</Label>
              <Input value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} />
            </div>
            <div>
              <Label>App ID</Label>
              <Input value={form.app_id || ""} onChange={(e) => setForm({ ...form, app_id: e.target.value })} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Integração ativa</Label>
            </div>
          </div>
          <div>
            <Label>Access Token (System User) *</Label>
            <Input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} />
          </div>

          {form.display_phone_number && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Número conectado: <strong>{form.display_phone_number}</strong> ({form.verified_name})
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing || !form.access_token}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube2 className="h-4 w-4 mr-2" />}
              Testar conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure no painel da Meta (WhatsApp &gt; Configuration) com a URL e o verify token abaixo.
          </p>
          <div>
            <Label>Callback URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input readOnly value={form.webhook_verify_token || "(salve para gerar)"} />
              <Button variant="outline" size="icon" disabled={!form.webhook_verify_token} onClick={() => copy(form.webhook_verify_token)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Eventos a assinar: <code>messages</code>, <code>message_template_status_update</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

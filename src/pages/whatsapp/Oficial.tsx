import WhatsAppOfficialIntegration from "@/components/integrations/WhatsAppOfficialIntegration";
import { useTenantContext } from "@/contexts/TenantContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const ALLOWED_SLUG = "orderzap";

export default function WhatsAppOfficialPage() {
  const { tenant } = useTenantContext();
  const allowed = tenant?.slug === ALLOWED_SLUG;

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">WhatsApp API Oficial (Meta)</h1>
      <p className="text-muted-foreground mb-6">
        Conecte sua conta WhatsApp Business oficial diretamente com a Meta Cloud API.
      </p>
      {allowed ? (
        <WhatsAppOfficialIntegration />
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            A integração com a <strong>API Oficial da Meta</strong> está disponível apenas para a empresa
            <strong> OrderZap</strong>. As demais empresas utilizam o fluxo padrão via <strong>Z-API</strong>.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

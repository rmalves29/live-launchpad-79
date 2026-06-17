import WhatsAppOfficialIntegration from "@/components/integrations/WhatsAppOfficialIntegration";

export default function WhatsAppOfficialPage() {
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">WhatsApp API Oficial (Meta)</h1>
      <p className="text-muted-foreground mb-6">
        Conecte sua conta WhatsApp Business oficial diretamente com a Meta Cloud API.
      </p>
      <WhatsAppOfficialIntegration />
    </div>
  );
}

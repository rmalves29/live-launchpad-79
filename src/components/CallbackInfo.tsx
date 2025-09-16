import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function CallbackInfo() {
  const baseUrl = "https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa";
  
  const callbacks = [
    {
      name: "Bling OAuth",
      url: `${baseUrl}?service=bling&action=oauth`,
      description: "Use esta URL como 'Link de redirecionamento' nas configurações do seu app Bling"
    },
    {
      name: "Bling Webhook",
      url: `${baseUrl}?service=bling&action=webhook`,
      description: "URL para webhooks do Bling (se disponível)"
    },
    {
      name: "Callback Genérico",
      url: `${baseUrl}?service=custom&action=callback`,
      description: "URL genérica para outros serviços"
    }
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("URL copiada para a área de transferência!");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          URLs de Callback - app.orderzaps.com
        </CardTitle>
        <CardDescription>
          URLs para configurar em integrações externas como Bling, MercadoPago, etc.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callbacks.map((callback, index) => (
          <div key={index} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{callback.name}</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(callback.url)}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {callback.description}
            </p>
            <code className="block text-xs bg-muted p-2 rounded break-all">
              {callback.url}
            </code>
          </div>
        ))}
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
          <h4 className="font-medium text-blue-900 mb-2">Como usar:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Bling:</strong> Cole a URL "Bling OAuth" nas configurações do seu app</li>
            <li>• <strong>Outros serviços:</strong> Use a URL genérica personalizando os parâmetros</li>
            <li>• <strong>Logs:</strong> Todos os callbacks são registrados na aba Integrações</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
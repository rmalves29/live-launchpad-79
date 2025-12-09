import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function CallbackInfo() {
  const baseUrl = "https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa";
  
  const callbacks = [
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

  const openUrl = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>URLs de Callback</CardTitle>
        <CardDescription>
          URLs para configurar em integrações externas como MercadoPago, etc.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callbacks.map((callback, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{callback.name}</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(callback.url)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => openUrl(callback.url)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {callback.description}
            </p>
            <code className="block p-2 bg-muted rounded text-sm break-all">
              {callback.url}
            </code>
          </div>
        ))}
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Como usar</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>MercadoPago:</strong> Cole a URL "Callback Genérico" nas configurações de webhook</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
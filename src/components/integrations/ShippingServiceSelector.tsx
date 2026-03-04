import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Truck } from 'lucide-react';

interface ShippingService {
  key: string;
  name: string;
  description: string;
}

interface ShippingServiceSelectorProps {
  services: ShippingService[];
  enabledServices: Record<string, boolean>;
  onToggle: (key: string, enabled: boolean) => void;
}

export default function ShippingServiceSelector({
  services,
  enabledServices,
  onToggle,
}: ShippingServiceSelectorProps) {
  const isEnabled = (key: string) => {
    // Default to true if not explicitly set
    return enabledServices[key] !== false;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Serviços Exibidos no Checkout
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Escolha quais serviços de frete serão exibidos para seus clientes no checkout.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.key}
              className={`flex items-center justify-between rounded-lg border p-3 transition-opacity ${
                !isEnabled(service.key) ? 'opacity-50' : ''
              }`}
            >
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">{service.description}</p>
              </div>
              <Switch
                checked={isEnabled(service.key)}
                onCheckedChange={(checked) => onToggle(service.key, checked)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

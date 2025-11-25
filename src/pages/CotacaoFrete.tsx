import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, Package, MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CotacaoForm {
  cep_destino: string;
  peso: string;
  altura: string;
  largura: string;
  comprimento: string;
  valor_declarado: string;
  retirada_em_maos: boolean;
}

interface ShippingOption {
  service_id: string;
  service_name: string;
  company: string;
  price: number;
  delivery_time: number;
  custom_price: number;
  custom_delivery_time: number;
}

export default function CotacaoFrete() {
  const [form, setForm] = useState<CotacaoForm>({
    cep_destino: "",
    peso: "",
    altura: "",
    largura: "",
    comprimento: "",
    valor_declarado: "",
    retirada_em_maos: false,
  });

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<ShippingOption | null>(null);
  const { toast } = useToast();

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) {
      return numbers;
    }
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const handleCEPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCEP(e.target.value);
    setForm({ ...form, cep_destino: formatted });
  };

  const calculateShipping = async () => {
    if (!form.cep_destino || !form.peso || !form.altura || !form.largura || !form.comprimento) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const cleanCEP = form.cep_destino.replace(/\D/g, '');
      
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipping', {
        body: {
          to_postal_code: cleanCEP,
          weight: parseFloat(form.peso),
          height: parseInt(form.altura),
          width: parseInt(form.largura),
          length: parseInt(form.comprimento),
          insurance_value: form.valor_declarado ? parseFloat(form.valor_declarado) : 0,
        }
      });

      if (error) {
        throw error;
      }

      if (data?.shipping_options) {
        setShippingOptions(data.shipping_options);
        toast({
          title: "Sucesso",
          description: `${data.shipping_options.length} opções encontradas`,
        });
      } else {
        setShippingOptions([]);
        toast({
          title: "Aviso",
          description: "Nenhuma opção de envio encontrada",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error calculating shipping:', error);
      toast({
        title: "Erro",
        description: "Erro ao calcular frete",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const selectShippingOption = async (option: ShippingOption) => {
    try {
      // Save quotation to database
      const { error } = await supabase
        .from('frete_cotacoes')
        .insert({
          cep_destino: form.cep_destino.replace(/\D/g, ''),
          peso: parseFloat(form.peso),
          altura: parseInt(form.altura),
          largura: parseInt(form.largura),
          comprimento: parseInt(form.comprimento),
          valor_declarado: form.valor_declarado ? parseFloat(form.valor_declarado) : null,
          servico_escolhido: option.service_name,
          valor_frete: option.custom_price,
          prazo: option.custom_delivery_time,
          transportadora: option.company,
          raw_response: option as any,
        });

      if (error) throw error;

      setSelectedOption(option);
      
      toast({
        title: "Sucesso",
        description: `Opção ${option.service_name} selecionada`,
      });

      // Here you would typically redirect to checkout or update cart with freight value
      // For now, just show success message

    } catch (error) {
      console.error('Error selecting shipping option:', error);
      toast({
        title: "Erro",
        description: "Erro ao selecionar opção de frete",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Cotação de Frete</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Dados da Encomenda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cep_destino">CEP de Destino *</Label>
              <Input
                id="cep_destino"
                value={form.cep_destino}
                onChange={handleCEPChange}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>

            <div>
              <Label htmlFor="peso">Peso (kg) *</Label>
              <Input
                id="peso"
                type="number"
                step="0.1"
                min="0.1"
                value={form.peso}
                onChange={(e) => setForm({...form, peso: e.target.value})}
                placeholder="0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="altura">Altura (cm) *</Label>
              <Input
                id="altura"
                type="number"
                min="1"
                value={form.altura}
                onChange={(e) => setForm({...form, altura: e.target.value})}
                placeholder="10"
              />
            </div>

            <div>
              <Label htmlFor="largura">Largura (cm) *</Label>
              <Input
                id="largura"
                type="number"
                min="1"
                value={form.largura}
                onChange={(e) => setForm({...form, largura: e.target.value})}
                placeholder="15"
              />
            </div>

            <div>
              <Label htmlFor="comprimento">Comprimento (cm) *</Label>
              <Input
                id="comprimento"
                type="number"
                min="1"
                value={form.comprimento}
                onChange={(e) => setForm({...form, comprimento: e.target.value})}
                placeholder="20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="valor_declarado">Valor Declarado (R$)</Label>
              <Input
                id="valor_declarado"
                type="number"
                step="0.01"
                min="0"
                value={form.valor_declarado}
                onChange={(e) => setForm({...form, valor_declarado: e.target.value})}
                placeholder="100.00"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="retirada_em_maos"
                checked={form.retirada_em_maos}
                onCheckedChange={(checked) => setForm({...form, retirada_em_maos: checked as boolean})}
              />
              <Label htmlFor="retirada_em_maos">Retirada em mãos</Label>
            </div>
          </div>

          <Button onClick={calculateShipping} disabled={loading} className="w-full">
            <Calculator className="w-4 h-4 mr-2" />
            {loading ? "Calculando..." : "Calcular Frete"}
          </Button>
        </CardContent>
      </Card>

      {shippingOptions.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Opções de Envio Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shippingOptions.map((option, index) => (
                <div
                  key={index}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedOption?.service_id === option.service_id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => selectShippingOption(option)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{option.service_name}</h4>
                        <Badge variant="secondary">{option.company}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {option.custom_delivery_time} dias úteis
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          R$ {option.custom_price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant={selectedOption?.service_id === option.service_id ? "default" : "outline"}
                      size="sm"
                    >
                      {selectedOption?.service_id === option.service_id ? "Selecionado" : "Escolher"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedOption && (
        <Card className="mt-6 border-primary">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-primary mb-2">
                Frete Selecionado: {selectedOption.service_name}
              </h3>
              <p className="text-2xl font-bold">
                R$ {selectedOption.custom_price.toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">
                Prazo: {selectedOption.custom_delivery_time} dias úteis
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
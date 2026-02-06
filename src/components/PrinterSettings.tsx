import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Printer, Save } from 'lucide-react';

export interface PrinterConfig {
  paperWidth: number; // mm
  fontSize: number; // px
  marginTop: number; // mm
  marginBottom: number; // mm
  marginSides: number; // mm
  showLogo: boolean;
  companyNameOverride: string;
}

const DEFAULT_CONFIG: PrinterConfig = {
  paperWidth: 80,
  fontSize: 12,
  marginTop: 5,
  marginBottom: 10,
  marginSides: 3,
  showLogo: false,
  companyNameOverride: '',
};

const STORAGE_KEY = 'printer_config';

export const getPrinterConfig = (): PrinterConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_CONFIG;
};

export const PrinterSettings = () => {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    setConfig(getPrinterConfig());
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    toast.success('Configurações da impressora salvas!');
  };

  const handlePresetChange = (value: string) => {
    const width = parseInt(value);
    setConfig(prev => ({ ...prev, paperWidth: width }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Configurações da Impressora Térmica
        </CardTitle>
        <CardDescription>
          Configure o tamanho do papel e layout para impressão de romaneios.
          As configurações são salvas neste navegador/dispositivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Paper Width Preset */}
          <div className="space-y-2">
            <Label>Modelo de Bobina</Label>
            <Select
              value={String(config.paperWidth)}
              onValueChange={handlePresetChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58mm (mini)</SelectItem>
                <SelectItem value="80">80mm (padrão)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Width */}
          <div className="space-y-2">
            <Label>Largura customizada (mm)</Label>
            <Input
              type="number"
              min={40}
              max={120}
              value={config.paperWidth}
              onChange={e => setConfig(prev => ({ ...prev, paperWidth: Number(e.target.value) }))}
            />
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <Label>Tamanho da Fonte (px)</Label>
            <Input
              type="number"
              min={8}
              max={18}
              value={config.fontSize}
              onChange={e => setConfig(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
            />
          </div>

          {/* Margins */}
          <div className="space-y-2">
            <Label>Margem superior (mm)</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={config.marginTop}
              onChange={e => setConfig(prev => ({ ...prev, marginTop: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Margem inferior (mm)</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={config.marginBottom}
              onChange={e => setConfig(prev => ({ ...prev, marginBottom: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Margens laterais (mm)</Label>
            <Input
              type="number"
              min={0}
              max={15}
              value={config.marginSides}
              onChange={e => setConfig(prev => ({ ...prev, marginSides: Number(e.target.value) }))}
            />
          </div>

          {/* Company Name Override */}
          <div className="space-y-2 md:col-span-2">
            <Label>Nome da empresa no romaneio (opcional)</Label>
            <Input
              placeholder="Se vazio, usa o nome cadastrado na aba Empresa"
              value={config.companyNameOverride}
              onChange={e => setConfig(prev => ({ ...prev, companyNameOverride: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full sm:w-auto">
          <Save className="h-4 w-4 mr-2" />
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
};

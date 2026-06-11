import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Tags, X, Plus, Minus, Save } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';


interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface LabelItem {
  product: Product;
  quantity: number;
}

interface PrintLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  preSelectedIds?: number[];
}

export default function PrintLabelsDialog({ open, onOpenChange, products, preSelectedIds }: PrintLabelsDialogProps) {
  const { tenant } = useTenant();
  const storageKey = tenant?.id ? `printLabelsConfig:${tenant.id}` : null;

  const [labelWidth, setLabelWidth] = useState(33);
  const [labelHeight, setLabelHeight] = useState(18);
  const [columns, setColumns] = useState(3);
  const [gapX, setGapX] = useState(3);
  const [gapY, setGapY] = useState(3);
  const [marginTop, setMarginTop] = useState(0);
  const [marginLeft, setMarginLeft] = useState(0);
  const [codeInput, setCodeInput] = useState('');

  // Load saved per-tenant config
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (typeof c.labelWidth === 'number') setLabelWidth(c.labelWidth);
      if (typeof c.labelHeight === 'number') setLabelHeight(c.labelHeight);
      if (typeof c.columns === 'number') setColumns(c.columns);
      if (typeof c.gapX === 'number') setGapX(c.gapX);
      if (typeof c.gapY === 'number') setGapY(c.gapY);
      if (typeof c.marginTop === 'number') setMarginTop(c.marginTop);
      if (typeof c.marginLeft === 'number') setMarginLeft(c.marginLeft);
    } catch {}
  }, [storageKey]);

  const saveConfig = () => {
    if (!storageKey) {
      toast.error('Tenant não identificado');
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify({
      labelWidth, labelHeight, columns, gapX, gapY, marginTop, marginLeft
    }));
    toast.success('Configuração de etiqueta salva para esta empresa');
  };
  const [items, setItems] = useState<LabelItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-select products from table checkboxes when dialog opens
  useEffect(() => {
    if (open && preSelectedIds && preSelectedIds.length > 0) {
      const existingIds = new Set(items.map(i => i.product.id));
      const newItems: LabelItem[] = [];
      for (const id of preSelectedIds) {
        if (!existingIds.has(id)) {
          const product = products.find(p => p.id === id);
          if (product) newItems.push({ product, quantity: 1 });
        }
      }
      if (newItems.length > 0) {
        setItems(prev => [...prev, ...newItems]);
      }
    }
  }, [open, preSelectedIds]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCodeSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !codeInput.trim()) return;
    e.preventDefault();

    const searchCode = codeInput.trim().toUpperCase();
    // Normalize: try raw, with C prefix, without C prefix
    const variations = [searchCode, `C${searchCode}`, searchCode.replace(/^C/i, '')];

    const found = products.find(p =>
      variations.some(v => p.code.toUpperCase() === v)
    );

    if (!found) {
      setCodeInput('');
      return;
    }

    // If already in list, increment quantity
    const existingIndex = items.findIndex(i => i.product.id === found.id);
    if (existingIndex >= 0) {
      setItems(prev => prev.map((item, idx) =>
        idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setItems(prev => [...prev, { product: found, quantity: 1 }]);
    }

    setCodeInput('');
  };

  const updateQuantity = (productId: number, delta: number) => {
    setItems(prev => prev.map(item =>
      item.product.id === productId
        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
        : item
    ));
  };

  const setQuantity = (productId: number, qty: number) => {
    setItems(prev => prev.map(item =>
      item.product.id === productId
        ? { ...item, quantity: Math.max(1, qty) }
        : item
    ));
  };

  const removeItem = (productId: number) => {
    setItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const totalLabels = items.reduce((sum, i) => sum + i.quantity, 0);

  const handlePrint = () => {
    if (items.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHtml = items.flatMap(({ product, quantity }) =>
      Array.from({ length: quantity }, () => {
        const barcodeHtml = generateCode128SVG(product.code);
        return `
          <div class="label">
            <div class="label-name">${escapeHtml(product.name)}</div>
            <div class="label-barcode">${barcodeHtml}</div>
            <div class="label-code">${escapeHtml(product.code)}</div>
          </div>
        `;
      })
    ).join('');

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas</title>
<style>
  @page {
    size: auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, ${labelWidth}mm);
    column-gap: ${gapX}mm;
    row-gap: ${gapY}mm;
    padding-top: ${marginTop}mm;
    padding-left: ${marginLeft}mm;
  }
  .label {
    width: ${labelWidth}mm;
    height: ${labelHeight}mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.5mm;
    page-break-inside: avoid;
  }
  .label-name {
    font-size: 6pt;
    font-weight: 700;
    text-align: center;
    line-height: 1.15;
    word-break: break-word;
    overflow-wrap: break-word;
    max-height: 7mm;
    overflow: hidden;
  }
  .label-barcode {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .label-barcode svg {
    max-width: ${labelWidth - 4}mm;
    max-height: 6mm;
    height: auto;
  }
  .label-code {
    font-size: 10pt;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.5pt;
  }
  @media print {
    html, body { margin: 0; padding: 0; }
    .grid { padding-top: ${marginTop}mm; padding-left: ${marginLeft}mm; }
  }
</style>
</head>
<body>
<div class="grid">${labelsHtml}</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Imprimir Etiquetas
          </DialogTitle>
          <DialogDescription>
            Bipe ou digite o código do produto e pressione Enter para adicionar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Config */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Largura (mm)</Label>
              <Input type="number" min={10} max={100} value={labelWidth} onChange={e => setLabelWidth(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura (mm)</Label>
              <Input type="number" min={10} max={100} value={labelHeight} onChange={e => setLabelHeight(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Colunas</Label>
              <Input type="number" min={1} max={10} value={columns} onChange={e => setColumns(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Espaço H (mm)</Label>
              <Input type="number" min={0} max={20} step={0.5} value={gapX} onChange={e => setGapX(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Espaço V (mm)</Label>
              <Input type="number" min={0} max={20} step={0.5} value={gapY} onChange={e => setGapY(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Margem topo (mm)</Label>
              <Input type="number" min={0} max={50} step={0.5} value={marginTop} onChange={e => setMarginTop(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Margem esq. (mm)</Label>
              <Input type="number" min={0} max={50} step={0.5} value={marginLeft} onChange={e => setMarginLeft(Number(e.target.value))} />
            </div>
          </div>

          {/* Code input */}
          <div className="space-y-1">
            <Label className="text-xs">Código do produto</Label>
            <Input
              ref={inputRef}
              placeholder="Digite ou bipe o código e pressione Enter..."
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              onKeyDown={handleCodeSubmit}
            />
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Prontos para imprimir ({items.length} {items.length === 1 ? 'produto' : 'produtos'}, {totalLabels} {totalLabels === 1 ? 'etiqueta' : 'etiquetas'})
            </Label>
            <ScrollArea className="h-48 border rounded-md">
              {items.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
                  Nenhum produto adicionado
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.code}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(product.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={quantity}
                          onChange={e => setQuantity(product.id, Number(e.target.value))}
                          className="w-12 h-7 text-center text-sm p-0"
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(product.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(product.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handlePrint} disabled={items.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir ({totalLabels})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateCode128SVG(text: string): string {
  const CODE128B: number[][] = [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
    [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
    [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
    [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
    [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
    [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
    [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
    [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
    [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
    [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
    [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
    [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
    [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
    [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
    [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
    [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
    [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
    [2,1,1,2,3,2],[2,3,3,1,1,1,2],
  ];

  const START_B = 104;
  const STOP = 106;

  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) - 32;
    if (charCode < 0 || charCode > 95) continue;
    codes.push(charCode);
    checksum += charCode * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP);

  const bars: number[] = [];
  for (const code of codes) {
    const pattern = CODE128B[code];
    if (pattern) bars.push(...pattern);
  }

  const barWidth = 1;
  const totalWidth = bars.reduce((sum, b) => sum + b, 0) * barWidth;
  let x = 0;
  let svgBars = '';

  for (let i = 0; i < bars.length; i++) {
    const w = bars[i] * barWidth;
    if (i % 2 === 0) {
      svgBars += `<rect x="${x}" y="0" width="${w}" height="30" fill="#000"/>`;
    }
    x += w;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 30" preserveAspectRatio="xMidYMid meet">${svgBars}</svg>`;
}

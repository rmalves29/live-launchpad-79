import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Tags } from 'lucide-react';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface PrintLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}

export default function PrintLabelsDialog({ open, onOpenChange, products }: PrintLabelsDialogProps) {
  const [labelWidth, setLabelWidth] = useState(33);
  const [labelHeight, setLabelHeight] = useState(18);
  const [columns, setColumns] = useState(3);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const activeProducts = products.filter(p => p.is_active);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(activeProducts.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleProduct = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    const selected = activeProducts.filter(p => selectedIds.has(p.id));
    if (selected.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHtml = selected.map(p => {
      const barcodeHtml = generateCode128SVG(p.code);
      return `
        <div class="label">
          <div class="label-name">${escapeHtml(p.name)}</div>
          <div class="label-barcode">${barcodeHtml}</div>
          <div class="label-code">${escapeHtml(p.code)}</div>
        </div>
      `;
    }).join('');

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
    gap: 2mm;
    padding: 2mm;
  }
  .label {
    width: ${labelWidth}mm;
    height: ${labelHeight}mm;
    border: 0.3mm solid #000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1mm;
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
    font-size: 6pt;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.5pt;
  }
  @media print {
    html, body { margin: 0; padding: 0; }
    .grid { padding: 0; }
    .label { border-color: #000; }
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
            Configure o tamanho, colunas e selecione os produtos para impressão.
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

          {/* Product selection */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 border-b pb-2">
              <Checkbox id="select-all" checked={selectAll} onCheckedChange={(c) => handleSelectAll(!!c)} />
              <Label htmlFor="select-all" className="text-sm font-medium">Selecionar todos ({activeProducts.length})</Label>
            </div>
            <ScrollArea className="h-48">
              <div className="space-y-1 pr-3">
                {activeProducts.map(p => (
                  <div key={p.id} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={`prod-${p.id}`}
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleProduct(p.id)}
                    />
                    <Label htmlFor={`prod-${p.id}`} className="text-sm flex-1 cursor-pointer">
                      {p.name} <span className="text-muted-foreground">({p.code})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handlePrint} disabled={selectedIds.size === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generates a simple Code 128B barcode as inline SVG string.
 */
function generateCode128SVG(text: string): string {
  // Code 128B encoding
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

  // Build bars
  const bars: number[] = [];
  for (const code of codes) {
    const pattern = CODE128B[code];
    if (pattern) bars.push(...pattern);
  }

  // Render SVG
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

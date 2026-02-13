import { useRef } from 'react';
import { getPrinterConfig } from '@/components/PrinterSettings';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatBrasiliaDate } from '@/lib/date-utils';

interface ReceiptOrder {
  id: number;
  tenant_order_number?: number;
  customer_phone: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  observation?: string;
  customer?: {
    name?: string;
    cpf?: string;
    instagram?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  };
  cart_items?: {
    id: number;
    qty: number;
    unit_price: number;
    product_name?: string;
    product_code?: string;
    product: {
      name: string;
      code: string;
      color?: string;
      size?: string;
    } | null;
  }[];
}

interface ThermalReceiptProps {
  order: ReceiptOrder;
  companyName?: string;
}

const buildReceiptHtml = (order: ReceiptOrder, companyName?: string): string => {
  const config = getPrinterConfig();
  const name = config.companyNameOverride || companyName || 'Minha Empresa';
  const orderNumber = order.tenant_order_number || order.id;
  const customer = order.customer;
  const customerName = customer?.name || 'Cliente não identificado';

  const productsSubtotal = order.cart_items?.reduce((sum, i) => sum + i.qty * i.unit_price, 0) || 0;
  const freteValue = Math.max(order.total_amount - productsSubtotal, 0);

  // Parse shipping info from observation
  const parseShipping = (obs?: string) => {
    if (!obs) return null;
    // Format: [FRETE] Melhor Envio - PAC | R$ 21.00 | Prazo: 6 dias úteis
    const m = obs.match(/\[FRETE\]\s*(.+)/);
    if (!m) {
      const m2 = obs.match(/Frete:\s*(.+)/);
      return m2 ? { label: m2[1].trim(), price: null, deadline: null } : null;
    }
    const parts = m[1].split('|').map(s => s.trim());
    const label = parts[0] || 'Frete';
    const priceMatch = parts[1]?.match(/R\$\s*([\d.,]+)/);
    const price = priceMatch ? priceMatch[1] : null;
    const deadlineMatch = parts[2]?.match(/Prazo:\s*(.+)/i);
    const deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
    return { label, price, deadline };
  };

  const shippingInfo = parseShipping(order.observation);

  // Build HTML for thermal printing
  const widthPx = Math.round(config.paperWidth * 3.78); // mm to px approx
  const fs = config.fontSize;

  const itemsHtml = (order.cart_items || []).map(item => {
    const pName = item.product?.name || item.product_name || 'Produto';
    const pCode = item.product?.code || item.product_code || '-';
    const color = item.product?.color;
    const size = item.product?.size;

    return `
      <div style="border-top:1px dashed #000;padding:6px 0;">
        <div style="text-align:center;"><strong>Cód: ${pCode}</strong> · Sku: ${pCode}</div>
        <div style="text-align:center;">Nome: <strong>${pName}</strong></div>
        ${size ? `<div style="text-align:center;">Tam: <strong>${size}</strong></div>` : ''}
        ${color ? `<div style="text-align:center;">Cor: <strong>${color}</strong></div>` : ''}
        <div style="text-align:center;">Qtd: <strong>${item.qty}</strong></div>
        <div style="text-align:center;">Valor: <strong>${formatCurrency(item.unit_price)}</strong></div>
      </div>
    `;
  }).join('');

  const cpfFormatted = customer?.cpf ? formatCPF(customer.cpf.replace(/\D/g, '')) : null;

  const obsText = order.observation
    ? order.observation.replace(/\[FRETE\].*/, '').replace(/Frete:.*/, '').trim()
    : '';

  return `
  <div class="receipt" style="width:${widthPx}px;">
    <div class="center bold" style="font-size:${fs + 2}px; padding:8px 0; border-bottom:2px solid #000;">
      ${name}
    </div>

    <div class="section">
      <div class="center"><strong>Data:</strong> ${formatBrasiliaDate(order.created_at)}</div>
      <div class="center"><strong>Pedido nº:</strong> ${orderNumber}</div>
      ${customer?.instagram ? `<div class="center">@: ${customer.instagram}</div>` : ''}
    </div>

    <div class="sep"></div>

    <div class="section">
      <div class="center"><strong>Nome:</strong> ${customerName}</div>
      ${customer?.street ? `<div class="center"><strong>End:</strong> ${customer.street} ${customer.number || ''}</div>` : ''}
      ${customer?.cep ? `<div class="center"><strong>CEP:</strong> ${customer.cep}</div>` : ''}
      ${customer?.complement ? `<div class="center"><strong>Comp:</strong> ${customer.complement}</div>` : ''}
      ${customer?.neighborhood ? `<div class="center"><strong>Bairro:</strong> ${customer.neighborhood}</div>` : ''}
      ${customer?.city ? `<div class="center"><strong>Cidade:</strong> ${customer.city}${customer?.state ? ` - ${customer.state}` : ''}</div>` : ''}
      <div class="center"><strong>Fone:</strong> ${formatPhoneForDisplay(order.customer_phone)}</div>
      ${obsText ? `<div class="center"><strong>*Obs:</strong> ${obsText}</div>` : ''}
    </div>

    ${cpfFormatted ? `<div class="sep"></div><div class="center section"><strong>CPF:</strong> ${cpfFormatted}</div>` : ''}

    ${itemsHtml}

    <div class="sep"></div>

    <div class="section center">
      <div>Subtotal:</div>
      <div class="bold" style="font-size:${fs + 1}px;">${formatCurrency(productsSubtotal)}</div>
    </div>

    ${order.is_paid ? `
    <div class="center section">
      <div>Pagamento:</div>
      <div class="bold">Confirmado</div>
    </div>` : `
    <div class="center section">
      <div>Pagamento:</div>
      <div class="bold" style="color:red;">Pendente</div>
    </div>`}

    ${shippingInfo ? `
    <div class="center section">
      <div>Entrega:</div>
      <div class="bold">${shippingInfo.label}</div>
      ${shippingInfo.deadline ? `<div>Prazo: ${shippingInfo.deadline}</div>` : ''}
    </div>
    <div class="center section">
      <div>Frete:</div>
      <div class="bold" style="font-size:${fs + 1}px;">${shippingInfo.price ? 'R$ ' + shippingInfo.price : formatCurrency(freteValue)}</div>
    </div>` : freteValue > 0 ? `
    <div class="center section">
      <div>Frete:</div>
      <div class="bold" style="font-size:${fs + 1}px;">${formatCurrency(freteValue)}</div>
    </div>` : ''}

    <div class="sep" style="border-top:2px solid #000;"></div>

    <div class="center section" style="padding:8px 0;">
      <div style="font-size:${fs + 3}px;"><strong>Total = ${formatCurrency(order.total_amount)}</strong></div>
    </div>
  </div>`;
};

const buildPrintPage = (receiptsHtml: string, config: ReturnType<typeof getPrinterConfig>) => {
  const widthPx = Math.round(config.paperWidth * 3.78);
  const fs = config.fontSize;
  
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Romaneio Térmico</title>
<style>
  @page {
    size: ${config.paperWidth}mm auto;
    margin: ${config.marginTop}mm ${config.marginSides}mm ${config.marginBottom}mm ${config.marginSides}mm;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: ${fs}px;
    width: ${widthPx}px;
    color: #000;
    background: #fff;
  }
  .center { text-align:center; }
  .bold { font-weight:bold; }
  .sep { border-top:1px dashed #000; margin:6px 0; }
  .section { padding:4px 0; }
  .cut-line {
    border-top: 2px dashed #000;
    margin: 16px 0;
    position: relative;
    page-break-after: always;
  }
  .cut-line::after {
    content: '✂ - - - - - - - - - - - - - - - - - - - -';
    position: absolute;
    top: -10px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    background: #fff;
  }
  .receipt:last-child .cut-line { display: none; }
</style>
</head>
<body>
  ${receiptsHtml}
</body>
</html>`;
};

export const printThermalReceipt = (order: ReceiptOrder, companyName?: string) => {
  const config = getPrinterConfig();
  const receiptHtml = buildReceiptHtml(order, companyName);
  const html = buildPrintPage(receiptHtml, config);
  const widthPx = Math.round(config.paperWidth * 3.78);

  const printWindow = window.open('', '_blank', `width=${widthPx},height=800`);
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};

export const printMultipleThermalReceipts = (orders: ReceiptOrder[], companyName?: string) => {
  if (orders.length === 0) return;
  
  const config = getPrinterConfig();
  const receiptsHtml = orders.map((order, index) => {
    const receipt = buildReceiptHtml(order, companyName);
    const cutLine = index < orders.length - 1 ? '<div class="cut-line"></div>' : '';
    return receipt + cutLine;
  }).join('');

  const html = buildPrintPage(receiptsHtml, config);
  const widthPx = Math.round(config.paperWidth * 3.78);

  const printWindow = window.open('', '_blank', `width=${widthPx},height=800`);
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};
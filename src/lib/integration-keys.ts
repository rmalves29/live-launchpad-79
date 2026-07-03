// Chaves canônicas das integrações exibidas na página /integrações.
// Controle de visibilidade fica em tenants.enabled_integrations (JSONB).
// Se a chave estiver ausente ou = true, a integração aparece; se = false, é ocultada.

export const INTEGRATION_KEYS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'bagy', label: 'Bagy' },
  { key: 'bling', label: 'Bling ERP' },
  { key: 'olist', label: 'Tiny/Olist ERP' },
  { key: 'omie', label: 'Omie ERP' },
  { key: 'mercadopago', label: 'Mercado Pago' },
  { key: 'pagarme', label: 'Pagar.me' },
  { key: 'sipag', label: 'Sipag (Sicoob)' },
  { key: 'appmax', label: 'App Max' },
  { key: 'infinitepay', label: 'InfinitePay' },
  { key: 'melhorenvio', label: 'Melhor Envio' },
  { key: 'mandae', label: 'Mandaê' },
  { key: 'superfrete', label: 'SuperFrete' },
  { key: 'correios', label: 'Correios' },
  { key: 'meuscorreios', label: 'Meus Correios' },
  { key: 'zapi', label: 'WhatsApp Z-API' },
  { key: 'uazapi', label: 'WhatsApp uazapi' },
  { key: 'whatsapp_oficial', label: 'WhatsApp Oficial' },
] as const;

export type IntegrationKey = typeof INTEGRATION_KEYS[number]['key'];

export function isIntegrationEnabled(
  map: Record<string, boolean> | null | undefined,
  key: IntegrationKey | string
): boolean {
  if (!map) return true; // default: tudo visível
  return map[key] !== false;
}

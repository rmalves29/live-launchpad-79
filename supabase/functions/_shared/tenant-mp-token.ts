type TenantMpIntegration = {
  is_active?: boolean | null;
  access_token?: string | null;
} | null | undefined;

// Tokens da plataforma nunca são aceitos para pagamentos de pedidos de lojas.
export function getActiveTenantMpToken(integration: TenantMpIntegration): string | null {
  if (!integration?.is_active) return null;
  return integration.access_token?.trim() || null;
}

export const MISSING_PAYMENT_PROVIDER_ERROR =
  "Não há sistema de pagamento cadastrado.";

export function missingPaymentProviderResponse(headers: HeadersInit): Response {
  return new Response(JSON.stringify({ success: false, error: MISSING_PAYMENT_PROVIDER_ERROR }), {
    status: 200,
    headers,
  });
}
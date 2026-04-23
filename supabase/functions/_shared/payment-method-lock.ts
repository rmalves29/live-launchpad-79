// =============================================================================
// payment-method-lock.ts — Restrição de método de pagamento por gateway
// =============================================================================
//
// PROPÓSITO
// ---------
// Garantir que, quando o cliente escolhe PIX no checkout (e ganha o desconto
// PIX), o gateway só permita pagar via PIX. Quando escolhe Cartão, o gateway
// só permita cartão (sem desconto PIX).
//
// Sem isso, o cliente pode escolher PIX no nosso checkout (recebe desconto)
// e depois pagar com cartão no gateway, ficando com desconto indevido.
//
// =============================================================================
// CHECKLIST PARA NOVOS GATEWAYS DE PAGAMENTO
// =============================================================================
// Ao adicionar um gateway novo (PagSeguro, Asaas, Stripe BR, etc.):
//
// 1. Adicionar o nome do provider no tipo `PaymentProvider` abaixo.
// 2. Implementar um `case '<provider>':` em `applyPaymentMethodLock()` que
//    mute o payload (ou retorne uma URL ajustada) para mostrar apenas o
//    método escolhido (`pix` ou `card`).
// 3. Na edge function do novo gateway, ANTES de chamar a API externa:
//
//      import { applyPaymentMethodLock } from "../_shared/payment-method-lock.ts";
//      applyPaymentMethodLock("<provider>", payload, body.payment_method);
//
//    (ou usar `buildLockedCheckoutUrl` se o gateway aceita query string).
// 4. Validar manualmente: cliente escolhe PIX → gateway mostra só PIX;
//    cliente escolhe Cartão → gateway mostra só cartão.
// =============================================================================

export type PaymentProvider =
  | "mercado_pago"
  | "pagarme"
  | "appmax"
  | "infinitepay";

export type PaymentMethodChoice = "pix" | "card" | null | undefined;

/**
 * Normaliza a escolha do cliente para "pix" | "card" | null.
 * Aceita variações comuns ("credit_card", "creditcard", "credito", etc.).
 */
export function normalizePaymentMethodChoice(
  raw: string | null | undefined,
): "pix" | "card" | null {
  if (!raw) return null;
  const v = String(raw).toLowerCase().trim();
  if (v === "pix") return "pix";
  if (
    v === "card" ||
    v === "credit" ||
    v === "credit_card" ||
    v === "creditcard" ||
    v === "credito" ||
    v === "cartao" ||
    v === "cartão" ||
    v === "debit" ||
    v === "debit_card"
  ) {
    return "card";
  }
  return null;
}

/**
 * Aplica restrição no payload do gateway para travar o método de pagamento.
 *
 * IMPORTANTE: muta o objeto `payload` in-place para os providers que aceitam
 * configuração via JSON (MP, Pagar.me, Appmax). Para InfinitePay, use
 * `buildLockedCheckoutUrl` na URL retornada.
 *
 * Se `choice` for null (cliente não escolheu nada), o payload não é alterado
 * e o gateway mostra todos os métodos (comportamento legado).
 */
export function applyPaymentMethodLock(
  provider: PaymentProvider | string,
  payload: Record<string, any>,
  choice: PaymentMethodChoice,
): void {
  const normalized = normalizePaymentMethodChoice(choice);
  if (!normalized) {
    console.log(
      `[payment-method-lock] provider=${provider} choice=null → no lock applied`,
    );
    return;
  }

  console.log(
    `[payment-method-lock] provider=${provider} choice=${normalized} → applying lock`,
  );

  switch (provider) {
    // -----------------------------------------------------------------------
    // MERCADO PAGO — Preference API
    // Docs: https://www.mercadopago.com.br/developers/pt/reference/preferences
    // Usa `payment_methods.excluded_payment_types` e `default_payment_method_id`
    // -----------------------------------------------------------------------
    case "mercado_pago": {
      payload.payment_methods = payload.payment_methods || {};
      if (normalized === "pix") {
        payload.payment_methods.excluded_payment_types = [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "ticket" }, // boleto
          { id: "atm" },
        ];
        payload.payment_methods.excluded_payment_methods = [
          { id: "bolbradesco" },
          { id: "pec" },
        ];
        payload.payment_methods.default_payment_method_id = "pix";
      } else {
        // card → bloqueia PIX, boleto e transferência
        payload.payment_methods.excluded_payment_types = [
          { id: "bank_transfer" }, // PIX
          { id: "ticket" }, // boleto
          { id: "atm" },
        ];
      }
      payload.payment_methods.installments =
        payload.payment_methods.installments ?? 12;
      return;
    }

    // -----------------------------------------------------------------------
    // PAGAR.ME — Core v5 (Orders + Checkout)
    // Docs: https://docs.pagar.me/reference/criar-pedido-2
    // Restringe `accepted_payment_methods` e remove blocos não usados.
    // -----------------------------------------------------------------------
    case "pagarme": {
      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      for (const p of payments) {
        if (!p?.checkout) continue;
        if (normalized === "pix") {
          p.checkout.accepted_payment_methods = ["pix"];
          delete p.checkout.boleto;
          delete p.checkout.credit_card;
        } else {
          p.checkout.accepted_payment_methods = ["credit_card"];
          delete p.checkout.boleto;
          delete p.checkout.pix;
        }
      }
      return;
    }

    // -----------------------------------------------------------------------
    // APPMAX — API v3 (/order)
    // Docs: https://docs.appmax.com.br/
    // Define `payment_type` para travar a forma no checkout.
    // -----------------------------------------------------------------------
    case "appmax": {
      payload.payment_type = normalized === "pix" ? "Pix" : "CreditCard";
      return;
    }

    // -----------------------------------------------------------------------
    // INFINITEPAY — público (handle)
    // O JSON da API não suporta restrição direta; a trava é via query string
    // no link retornado. Use `buildLockedCheckoutUrl` em vez desta função.
    // -----------------------------------------------------------------------
    case "infinitepay": {
      payload.__use_url_lock = true; // marcador, sem efeito no payload
      return;
    }

    // -----------------------------------------------------------------------
    // FALLBACK — gateway desconhecido
    // -----------------------------------------------------------------------
    default: {
      console.warn(
        `[payment-method-lock] TODO: implementar lock para provider="${provider}". ` +
          `O cliente escolheu "${normalized}" mas o gateway pode mostrar outros métodos. ` +
          `Adicione um case em supabase/functions/_shared/payment-method-lock.ts.`,
      );
      return;
    }
  }
}

/**
 * Constrói uma URL de checkout com a query string que trava o método de
 * pagamento. Use para gateways que só aceitam restrição via URL (ex: InfinitePay).
 *
 * Retorna a URL original se `choice` for null.
 */
export function buildLockedCheckoutUrl(
  baseUrl: string,
  choice: PaymentMethodChoice,
): string {
  const normalized = normalizePaymentMethodChoice(choice);
  if (!normalized) return baseUrl;

  // InfinitePay aceita ?payment_method=pix|credit_card
  const param = normalized === "pix" ? "pix" : "credit_card";

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("payment_method", param);
    return url.toString();
  } catch {
    // Fallback se baseUrl não for URL válida (ex: contém #fragment custom)
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}payment_method=${param}`;
  }
}

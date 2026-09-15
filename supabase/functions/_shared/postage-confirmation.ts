// Regra única e obrigatória para todas as transportadoras/ERPs:
// a mensagem de "pedido enviado" só pode sair quando a transportadora
// confirmar a POSTAGEM/COLETA de fato. Gerar etiqueta NÃO é postagem.
//
// Esta função analisa apenas VALORES de status/descrição de eventos,
// nunca o JSON inteiro (nomes de campos como "postedAt": null geravam
// falso positivo e disparavam a mensagem antes do envio real).

const POSTED_PATTERN =
  /(postad|postagem|posted|objeto recebido|coletad|coleta realizada|collected|shipped|em tr[âa]nsito|in[_ -]?transit|encaminhad|saiu para entrega|out[_ -]?for[_ -]?delivery|entregue|delivered)/i;

const NOT_POSTED_PATTERN =
  /(aguardando|pendente|pending|created|criad|label|etiqueta|pre[_ -]?postagem|waiting|cancel)/i;

function pickStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [];
  if (Array.isArray(value)) return value.flatMap((v) => pickStrings(v, depth + 1));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = [
      "status",
      "situacao",
      "situation",
      "description",
      "descricao",
      "descrição",
      "event",
      "eventName",
      "type",
      "name",
      "message",
      "title",
      "EventDescription",
      "TrackingEventStatus",
      "Status",
    ];
    return keys.flatMap((k) => pickStrings(obj[k], depth + 1));
  }
  return [];
}

/** Retorna true apenas se algum status/descrição indicar postagem real. */
export function isPostedFromEvents(payload: unknown): boolean {
  const texts = pickStrings(payload);
  return texts.some((t) => POSTED_PATTERN.test(t) && !NOT_POSTED_PATTERN.test(t));
}

/** Verifica um status simples (string) informado pela transportadora. */
export function isPostedStatus(status: unknown): boolean {
  const s = String(status ?? "").trim();
  if (!s) return false;
  return POSTED_PATTERN.test(s) && !NOT_POSTED_PATTERN.test(s);
}

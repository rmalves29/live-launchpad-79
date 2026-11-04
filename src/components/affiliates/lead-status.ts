export const LEAD_STATUS: Record<string, string> = {
  indicado: 'Indicado',
  reuniao_agendada: 'Reunião agendada',
  reuniao_feita: 'Reunião feita',
  aguardando_pagamento: 'Aguardando pagamento',
  expirado: 'Expirado',
  fechado: 'Fechado',
  pagando: 'Pagando',
  perdido: 'Perdido',
};
export const LEAD_STATUS_ORDER = ['indicado', 'reuniao_agendada', 'reuniao_feita', 'aguardando_pagamento', 'expirado', 'fechado', 'pagando', 'perdido'] as const;
export const LEAD_ORIGEM: Record<string, string> = { landing: 'Indicação (landing)', afiliado: 'Indicação (afiliada)', manual: 'Manual', self_signup: 'Contratação direta' };
export const MEETING_TYPE: Record<string, string> = { apresentacao: 'Apresentação', onboarding: 'Onboarding' };
export const SIGNUP_STATUS: Record<string, string> = { aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', expirado: 'Expirado' };

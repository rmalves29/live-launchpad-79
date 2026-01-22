import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BRASILIA_TZ = 'America/Sao_Paulo';

/**
 * Converte uma Date qualquer para uma string ISO de data (YYYY-MM-DD) no timezone de Brasília.
 */
export const toBrasiliaDateISO = (date: Date): string => {
  return formatInTimeZone(date, BRASILIA_TZ, 'yyyy-MM-dd');
};

/**
 * Retorna bounds (início/fim) do dia em Brasília com offset, ideais para filtros em timestamptz.
 * Ex: 2026-01-21 => { start: 2026-01-21T00:00:00-03:00, end: 2026-01-21T23:59:59.999-03:00 }
 */
export const getBrasiliaDayBoundsISO = (dateISO: string): { start: string; end: string } => {
  return {
    start: `${dateISO}T00:00:00-03:00`,
    end: `${dateISO}T23:59:59.999-03:00`,
  };
};

/**
 * Retorna a data/hora atual no timezone de Brasília
 */
export const getBrasiliaDate = (): Date => {
  return toZonedTime(new Date(), BRASILIA_TZ);
};

/**
 * Retorna a data atual no formato ISO (YYYY-MM-DD) no timezone de Brasília
 */
export const getBrasiliaDateISO = (): string => {
  return formatInTimeZone(new Date(), BRASILIA_TZ, 'yyyy-MM-dd');
};

/**
 * Retorna a data/hora atual no formato ISO completo no timezone de Brasília
 */
export const getBrasiliaDateTimeISO = (): string => {
  return formatInTimeZone(new Date(), BRASILIA_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
};

/**
 * Parseia uma data YYYY-MM-DD como local (não UTC) para evitar offset de timezone
 */
export const parseDateAsLocal = (dateString: string): Date => {
  // Se já contém horário, usar como está
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  // Para datas YYYY-MM-DD, adicionar horário local para evitar interpretação UTC
  return new Date(dateString + 'T12:00:00');
};

/**
 * Formata uma data para o padrão brasileiro (dd/MM/yyyy)
 */
export const formatBrasiliaDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseDateAsLocal(date) : date;
  return formatInTimeZone(dateObj, BRASILIA_TZ, 'dd/MM/yyyy', { locale: ptBR });
};

/**
 * Formata uma data para formato longo brasileiro (dd de MMMM de yyyy)
 */
export const formatBrasiliaDateLong = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseDateAsLocal(date) : date;
  return formatInTimeZone(dateObj, BRASILIA_TZ, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

/**
 * Formata uma data/hora para o padrão brasileiro (dd/MM/yyyy HH:mm)
 */
export const formatBrasiliaDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, BRASILIA_TZ, 'dd/MM/yyyy HH:mm', { locale: ptBR });
};

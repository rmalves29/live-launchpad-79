import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BRASILIA_TZ = 'America/Sao_Paulo';

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
 * Formata uma data para o padrão brasileiro (dd/MM/yyyy)
 */
export const formatBrasiliaDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, BRASILIA_TZ, 'dd/MM/yyyy', { locale: ptBR });
};

/**
 * Formata uma data/hora para o padrão brasileiro (dd/MM/yyyy HH:mm)
 */
export const formatBrasiliaDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, BRASILIA_TZ, 'dd/MM/yyyy HH:mm', { locale: ptBR });
};

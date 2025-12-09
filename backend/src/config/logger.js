import pino from 'pino';

export function setupLogger() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: !isProduction ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    } : undefined
  });
}

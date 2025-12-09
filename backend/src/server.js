import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import whatsappRoutes from './routes/whatsapp.routes.js';
import orderRoutes from './routes/order.routes.js';
import { setupLogger } from './config/logger.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const logger = setupLogger();

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Rotas
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'OrderZap Backend API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/orders', orderRoutes);

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Backend rodando na porta ${PORT}`);
  logger.info(`📱 WhatsApp API: http://localhost:${PORT}/api/whatsapp`);
  logger.info(`📦 Orders API: http://localhost:${PORT}/api/orders`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, fechando servidor...');
  process.exit(0);
});

export default app;

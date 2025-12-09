import express from 'express';
import whatsappController from '../controllers/whatsapp.controller.js';

const router = express.Router();

// Rotas de conexão
router.post('/start', whatsappController.startConnection);
router.post('/disconnect', whatsappController.disconnect);
router.get('/qrcode/:tenantId', whatsappController.getQRCode);
router.get('/status/:tenantId', whatsappController.getStatus);
router.get('/sessions', whatsappController.getSessions);

// Rotas de mensagens
router.post('/send-message', whatsappController.sendMessage);
router.post('/send-media', whatsappController.sendMedia);

export default router;

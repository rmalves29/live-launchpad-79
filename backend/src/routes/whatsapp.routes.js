import express from 'express';
import whatsappController from '../controllers/whatsapp.controller.js';

const router = express.Router();

// Rotas v5.0 - compatíveis com Railway/Edge Functions
router.post('/start/:id', whatsappController.startConnection);
router.post('/disconnect/:id', whatsappController.disconnect);
router.post('/reset/:id', whatsappController.resetSession);
router.get('/status/:id', whatsappController.getStatus);
router.get('/sessions', whatsappController.getSessions);

// Rotas de mensagens
router.post('/send-message', whatsappController.sendMessage);
router.post('/send-media', whatsappController.sendMedia);

export default router;

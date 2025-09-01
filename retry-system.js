// Sistema de retry para mensagens WhatsApp
class RetrySystem {
  constructor() {
    this.pendingMessages = new Map(); // messageId -> { numero, mensagem, instancia, imgPath, tentativas, ultimaTentativa }
    this.maxRetries = 3;
    this.retryInterval = 30000; // 30 segundos
    this.stats = {
      totalMessages: 0,
      successfulRetries: 0,
      failedRetries: 0
    };
    
    // Iniciar loop de retry
    this.startRetryLoop();
  }

  addMessageForRetry(messageId, numero, mensagem, instancia, imgPath = null) {
    this.pendingMessages.set(messageId, {
      numero,
      mensagem,
      instancia,
      imgPath,
      tentativas: 0,
      ultimaTentativa: Date.now(),
      adicionadoEm: Date.now()
    });
    this.stats.totalMessages++;
  }

  removeMessage(messageId) {
    this.pendingMessages.delete(messageId);
  }

  startRetryLoop() {
    setInterval(() => {
      this.processRetries();
    }, this.retryInterval);
  }

  async processRetries() {
    const now = Date.now();
    const messagesToRetry = [];

    for (const [messageId, messageData] of this.pendingMessages.entries()) {
      // Se passou do tempo de retry e não excedeu o máximo de tentativas
      if (now - messageData.ultimaTentativa > this.retryInterval && messageData.tentativas < this.maxRetries) {
        messagesToRetry.push({ messageId, ...messageData });
      }
      // Se excedeu tentativas ou muito tempo passou, remover
      else if (messageData.tentativas >= this.maxRetries || now - messageData.adicionadoEm > 300000) { // 5 minutos
        this.pendingMessages.delete(messageId);
        if (messageData.tentativas >= this.maxRetries) {
          this.stats.failedRetries++;
        }
      }
    }

    // Processar retries
    for (const messageData of messagesToRetry) {
      try {
        // Aqui você implementaria a lógica de envio novamente
        // Por simplicidade, vamos apenas marcar como tentativa
        const updated = this.pendingMessages.get(messageData.messageId);
        if (updated) {
          updated.tentativas++;
          updated.ultimaTentativa = now;
          
          console.log(`Retry ${updated.tentativas}/${this.maxRetries} para ${messageData.numero}`);
          
          // Se conseguiu enviar com sucesso, remover da lista
          // (isso seria feito pela lógica de envio real)
          if (Math.random() > 0.3) { // Simular sucesso de 70%
            this.pendingMessages.delete(messageData.messageId);
            this.stats.successfulRetries++;
            console.log(`Retry bem-sucedido para ${messageData.numero}`);
          }
        }
      } catch (error) {
        console.error(`Erro no retry para ${messageData.numero}:`, error);
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      pendingMessages: this.pendingMessages.size,
      messagesList: Array.from(this.pendingMessages.entries()).map(([id, data]) => ({
        id,
        numero: data.numero,
        tentativas: data.tentativas,
        ultimaTentativa: new Date(data.ultimaTentativa).toISOString()
      }))
    };
  }
}

module.exports = RetrySystem;
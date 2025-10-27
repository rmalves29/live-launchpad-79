/**
 * Sistema de fila para envio de mensagens WhatsApp
 * Evita sobrecarga e gerencia lógica de repetição
 */

export class WhatsAppQueue {
  constructor() {
    this.queues = new Map(); // tenantId -> array de mensagens
    this.processing = new Map(); // tenantId -> booleano
    this.stats = new Map(); // tenantId -> { enviado, falhou, pendente }
  }

  /**
   * Adiciona uma mensagem na fila
   */
  enqueue(tenantId, message) {
    if (!this.queues.has(tenantId)) {
      this.queues.set(tenantId, []);
      this.stats.set(tenantId, { enviado: 0, falhou: 0, pendente: 0 });
    }

    const queue = this.queues.get(tenantId);
    const normalizedMessage = {
      ...message,
      delayAfterMs:
        typeof message.delayAfterMs === 'number'
          ? Math.max(0, message.delayAfterMs)
          : undefined
    };

    queue.push({
      id: `${Date.now()}-${Math.random()}`,
      tenantId,
      ...normalizedMessage,
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now()
    });

    const stats = this.stats.get(tenantId);
    stats.pendente++;

    console.log(`📥 [Queue] Mensagem adicionada à fila do tenant ${tenantId}`);
    console.log(`   Tamanho da fila: ${queue.length}`);
    console.log(`   Estatísticas:`, stats);
  }

  /**
   * Processa a fila de um tenant
   */
  async processQueue(tenantId, sendFunction, validationFunction) {
    // Evitar processamento concorrente
    if (this.processing.get(tenantId)) {
      console.log(`⏳ [Queue] Já está processando fila do tenant ${tenantId}`);
      return;
    }

    const queue = this.queues.get(tenantId);
    if (!queue || queue.length === 0) {
      return;
    }

    this.processing.set(tenantId, true);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 [Queue] Iniciando processamento da fila`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Mensagens pendentes: ${queue.length}`);
    console.log(`${'='.repeat(70)}\n`);

    const stats = this.stats.get(tenantId);

    while (queue.length > 0) {
      const message = queue[0];

      // Validar se ainda pode enviar (sessão válida)
      const canSend = await validationFunction(tenantId);
      if (!canSend) {
        console.log(`❌ [Queue] Sessão inválida - pausando processamento`);
        this.processing.set(tenantId, false);
        return;
      }

      try {
        console.log(`\n📤 [Queue] Processando mensagem ${message.id}`);
        console.log(`   Tentativa: ${message.attempts + 1}/${message.maxAttempts}`);
        console.log(`   Grupo: ${message.groupId}`);
        console.log(`   Preview: ${message.message.substring(0, 50)}...`);

        // Tentar enviar
        await sendFunction(message);

        // Sucesso - remover da fila
        queue.shift();
        stats.enviado++;
        stats.pendente--;

        console.log(`✅ [Queue] Mensagem enviada com sucesso`);
        console.log(`   Stats atualizadas:`, stats);

        // Aguardar intervalo entre mensagens (evitar rate limit)
        const delay =
          typeof message.delayAfterMs === 'number' ? message.delayAfterMs : 2000; // padrão de 2s
        if (delay > 0) {
          console.log(`⏳ [Queue] Aguardando ${delay}ms antes da próxima mensagem...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        message.attempts++;
        message.lastError = error.message;

        console.error(`\n❌ [Queue] Erro ao processar mensagem ${message.id}`);
        console.error(`   Tentativa: ${message.attempts}/${message.maxAttempts}`);
        console.error(`   Erro: ${error.message}`);

        // Se for erro de sessão, parar imediatamente
        if (
          error.message.includes('Sem sessões') ||
          error.message.includes('Conexão Fechada') ||
          error.message.includes('desconectado')
        ) {
          console.error(`🚫 [Queue] Erro de sessão detectado - parando processamento`);
          this.processing.set(tenantId, false);
          return;
        }

        // Se atingiu max tentativas, remover da fila
        if (message.attempts >= message.maxAttempts) {
          console.error(`💀 [Queue] Mensagem ${message.id} excedeu máximo de tentativas - removendo`);
          queue.shift();
          stats.falhou++;
          stats.pendente--;
        } else {
          // Aguardar backoff antes de tentar novamente
          const backoff = message.attempts * 2000; // 2s, 4s
          console.log(`⏳ [Queue] Aguardando ${backoff}ms antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ [Queue] Processamento concluído`);
    console.log(`   Stats finais:`, stats);
    console.log(`${'='.repeat(70)}\n`);

    this.processing.set(tenantId, false);
  }

  /**
   * Retorna estatísticas da fila
   */
  getStats(tenantId) {
    return this.stats.get(tenantId) || { enviado: 0, falhou: 0, pendente: 0 };
  }

  /**
   * Limpa a fila de um tenant
   */
  clearQueue(tenantId) {
    this.queues.delete(tenantId);
    this.processing.delete(tenantId);
    this.stats.delete(tenantId);
    console.log(`🗑️ [Queue] Fila limpa para tenant ${tenantId}`);
  }

  /**
   * Retorna tamanho da fila
   */
  getQueueSize(tenantId) {
    const queue = this.queues.get(tenantId);
    return queue ? queue.length : 0;
  }
}

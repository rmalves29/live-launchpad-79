/**
 * Validador de sessões WhatsApp Signal
 * Garante que sessões estão válidas antes de enviar mensagens
 */

export class SessionValidator {
  /**
   * Valida se uma sessão está pronta para envio
   */
  static async validateSession(sock, tenantId, tenantName) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 [SessionValidator] Validando sessão do tenant ${tenantName}`);
    console.log(`${'='.repeat(70)}`);

    // 1. Verificar se socket existe
    if (!sock) {
      console.log(`❌ Socket não existe`);
      console.log(`${'='.repeat(70)}\n`);
      return { valid: false, reason: 'Socket não existe' };
    }

    // 2. Verificar WebSocket connection
    const wsState = sock.ws?.readyState;
    console.log(`🔌 WebSocket State: ${wsState} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
    
    if (wsState !== 1) {
      console.log(`❌ WebSocket não está aberto`);
      console.log(`${'='.repeat(70)}\n`);
      return { valid: false, reason: 'WebSocket não conectado' };
    }

    // 3. Verificar authState
    if (!sock.authState) {
      console.log(`❌ authState não existe`);
      console.log(`${'='.repeat(70)}\n`);
      return { valid: false, reason: 'authState ausente' };
    }

    // 4. Verificar credenciais (creds)
    const hasCreds = sock.authState.creds && 
                     sock.authState.creds.me && 
                     sock.authState.creds.me.id;
    console.log(`🔑 Credenciais: ${hasCreds ? '✅' : '❌'}`);
    if (hasCreds) {
      console.log(`   WhatsApp ID: ${sock.authState.creds.me.id}`);
    }

    if (!hasCreds) {
      console.log(`❌ Credenciais ausentes`);
      console.log(`${'='.repeat(70)}\n`);
      return { valid: false, reason: 'Credenciais ausentes' };
    }

    // 5. CRÍTICO: Verificar sessões Signal (necessárias para criptografia E2E)
    const hasKeys = sock.authState.keys;
    const hasGetFunction = hasKeys && typeof sock.authState.keys.get === 'function';
    
    console.log(`🔐 Signal Keys: ${hasKeys ? '✅' : '❌'}`);
    console.log(`🔐 Keys.get function: ${hasGetFunction ? '✅' : '❌'}`);

    if (!hasKeys || !hasGetFunction) {
      console.log(`❌ Sessões Signal ausentes - não é possível enviar mensagens`);
      console.log(`${'='.repeat(70)}\n`);
      return { 
        valid: false, 
        reason: 'Sessões Signal ausentes - necessário reconectar' 
      };
    }

    // 6. Tentar verificar se há ao menos uma sessão criada
    try {
      // Tentar ler uma sessão qualquer para verificar se o storage está funcionando
      const testKey = 'session-test-key';
      const testSession = await sock.authState.keys.get(testKey).catch(() => null);
      console.log(`🧪 Teste de leitura de sessão: ${testSession ? 'Funcionando' : 'Vazio (normal)'}`);
    } catch (error) {
      console.log(`⚠️ Erro ao testar leitura de sessão: ${error.message}`);
    }

    // Todas as validações passaram
    console.log(`✅ Sessão válida e pronta para envio`);
    console.log(`${'='.repeat(70)}\n`);

    return { 
      valid: true, 
      whatsappId: sock.authState.creds.me.id,
      wsState 
    };
  }

  /**
   * Valida de forma rápida (sem logs extensos)
   * IMPORTANTE: NÃO valida sock.ws.readyState pois é transitório durante envio
   */
  static quickValidate(sock) {
    // Validar apenas se o socket existe
    if (!sock) {
      return false;
    }

    // Validar authState e credenciais
    if (!sock.authState || !sock.authState.creds || !sock.authState.creds.me) {
      return false;
    }

    // Validar se tem as chaves Signal (necessárias para criptografia E2E)
    if (!sock.authState.keys || typeof sock.authState.keys.get !== 'function') {
      return false;
    }

    // NÃO validar sock.ws.readyState - ele é transitório durante envio de mensagens
    // e pode causar falsos negativos
    return true;
  }
}

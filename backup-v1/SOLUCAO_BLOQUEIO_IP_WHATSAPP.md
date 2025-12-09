# Solução: Erro 405 - IP Bloqueado pelo WhatsApp

## 🚨 Problema

O erro **405** indica que o WhatsApp bloqueou temporariamente seu IP devido a muitas tentativas de conexão em um curto período de tempo.

```
❌ app: DESCONECTADO
⚠️ Erro 405: WhatsApp bloqueou o IP temporariamente
```

## ✅ Soluções

### Solução 1: Usar o Novo Servidor com Proteção

Criei um servidor melhorado que previne e resolve automaticamente esse problema:

#### Passo 1: Parar o Servidor Atual

```bash
# Se estiver rodando diretamente
Ctrl + C

# Se estiver rodando com PM2
pm2 stop all
pm2 delete all
```

#### Passo 2: Limpar Sessões Antigas

```bash
cd backend

# Remover todas as sessões
rm -rf baileys_auth/*

# Ou remover apenas a sessão problemática
rm -rf baileys_auth/SEU_TENANT_ID
```

#### Passo 3: Usar o Novo Servidor

```bash
# Rodar diretamente
node server-whatsapp-fixed.js

# Ou com PM2 (recomendado para produção)
pm2 start server-whatsapp-fixed.js --name whatsapp-api
pm2 logs whatsapp-api
```

### Solução 2: Aguardar o Cooldown (Temporário)

Se já está com IP bloqueado:

1. **Aguarde 5-10 minutos** sem tentar conectar
2. O bloqueio é temporário e será removido automaticamente
3. Após o período, use o servidor corrigido

### Solução 3: Usar Proxy ou VPN (Avançado)

Se o bloqueio persistir:

1. Configure um proxy ou VPN
2. Altere seu endereço IP
3. Tente conectar novamente

## 🛡️ O Que o Novo Servidor Faz Diferente

### 1. Controle de Reconexões
```javascript
// Limita tentativas de reconexão
MAX_RECONNECT_ATTEMPTS = 3
RECONNECT_COOLDOWN = 60000 // 1 minuto
```

### 2. Detecção de Bloqueio
```javascript
if (statusCode === 405) {
  // IP bloqueado - aguarda 5 minutos automaticamente
  logger.error('⚠️ IP bloqueado temporariamente pelo WhatsApp');
  
  // Aguarda cooldown antes de tentar novamente
  setTimeout(() => reconectar(), 5 * 60 * 1000);
}
```

### 3. Delays Entre Mensagens
```javascript
// Broadcast com delay de 2 segundos entre mensagens
const delayBetweenMessages = 2000;
await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
```

### 4. Configurações Otimizadas
```javascript
const sock = makeWASocket({
  browser: Browsers.ubuntu('Chrome'), // Identifica como navegador
  markOnlineOnConnect: false, // Não marca online automaticamente
  syncFullHistory: false, // Não sincroniza histórico completo
  retryRequestDelayMs: 250, // Delay entre tentativas
});
```

## 📋 Checklist Pós-Implementação

Após iniciar o novo servidor, verifique:

- [ ] Servidor iniciou sem erros
- [ ] QR Code é gerado corretamente
- [ ] Conexão estabelecida com sucesso
- [ ] Mensagens são enviadas normalmente
- [ ] Não há múltiplas tentativas de reconexão

## 🔍 Monitoramento

### Verificar Status
```bash
curl http://localhost:3333/status/SEU_TENANT_ID
```

Resposta esperada:
```json
{
  "ok": true,
  "tenantId": "xxx",
  "status": "ready",
  "hasQR": false,
  "reconnectAttempts": 0,
  "canReconnect": true
}
```

### Status Possíveis

- **connecting**: Conectando ao WhatsApp
- **qr**: Aguardando leitura do QR Code
- **ready**: ✅ Conectado e funcionando
- **reconnecting**: Reconectando (normal)
- **blocked**: ⚠️ IP bloqueado (aguardando cooldown)
- **auth_failure**: ❌ Falha de autenticação (requer reset)
- **disconnected**: Desconectado

## 🚑 Troubleshooting Adicional

### Problema: Ainda recebo erro 405

**Solução:**
1. Aguarde pelo menos 10 minutos sem tentar conectar
2. Reinicie seu roteador (para obter novo IP externo)
3. Use um serviço de VPN temporariamente
4. Entre em contato com seu provedor de hosting se estiver em servidor

### Problema: QR Code não aparece

**Solução:**
```bash
# Reset completo
curl -X POST http://localhost:3333/reset/SEU_TENANT_ID

# Aguarde 30 segundos e obtenha o QR
curl http://localhost:3333/qr/SEU_TENANT_ID
```

### Problema: Desconecta frequentemente

**Solução:**
1. Verifique sua conexão de internet
2. Não use o mesmo número em múltiplos dispositivos
3. Evite enviar muitas mensagens rapidamente
4. Use o servidor corrigido que controla melhor as reconexões

## 📊 Logs para Diagnóstico

### Ver Logs do PM2
```bash
pm2 logs whatsapp-api --lines 100
```

### Ver Logs em Tempo Real
```bash
pm2 logs whatsapp-api
```

### Procurar por Erros Específicos
```bash
pm2 logs whatsapp-api | grep "405"
pm2 logs whatsapp-api | grep "blocked"
```

## 🔧 Configurações Avançadas

### Ajustar Tempos de Cooldown

Edite `server-whatsapp-fixed.js`:

```javascript
// Aumentar cooldown para IPs muito bloqueados
const RECONNECT_COOLDOWN = 120000; // 2 minutos ao invés de 1

// Para erro 405, aguardar mais tempo
const cooldownTime = 10 * 60 * 1000; // 10 minutos ao invés de 5
```

### Adicionar Proxy

```javascript
import { SocksProxyAgent } from 'socks-proxy-agent';

const sock = makeWASocket({
  agent: new SocksProxyAgent('socks5://seu-proxy:porta'),
  // ... outras configurações
});
```

## 📝 Prevenção

### Boas Práticas

1. **Não force reconexões**: Deixe o sistema gerenciar automaticamente
2. **Delay entre mensagens**: Sempre use pelo menos 1-2 segundos
3. **Limite broadcast**: Não envie para muitos números de uma vez
4. **Monitore logs**: Fique atento a sinais de problemas
5. **Use sessões persistentes**: Evite reautenticar constantemente

### Limites Recomendados

- **Mensagens individuais**: Máximo 20 por minuto
- **Broadcast**: Máximo 10 números por lote
- **Delay entre mensagens**: Mínimo 2 segundos
- **Reconexões**: Máximo 3 tentativas por hora

## 🆘 Suporte

Se o problema persistir após seguir todas as soluções:

1. Verifique os logs completos
2. Confirme que está usando `server-whatsapp-fixed.js`
3. Aguarde pelo menos 1 hora sem tentar conectar
4. Considere usar um IP diferente

## 📚 Referências

- [Baileys Documentation](https://whiskeysockets.github.io/)
- [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy)
- Arquivo: `backend/server-whatsapp-fixed.js`

---

**Última atualização**: 06/12/2025

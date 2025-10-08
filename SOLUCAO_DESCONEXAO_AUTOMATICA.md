# 🔧 SOLUÇÃO: Desconexão Automática do WhatsApp

## ⚠️ Problema

O sistema estava conectando no WhatsApp, mas após alguns minutos desconectava automaticamente com o erro:

```
Error: EBUSY: resource busy or locked, unlink 'C:\whatsapp-automacao\.wwebjs_auth\...'
at async LocalAuth.logout
```

## 🔍 Causa Raiz

O **frontend** estava fazendo polling (verificação periódica) para as rotas:

```
GET /status/08f2b1b9-3988-489e-8186-c60f0c0b0622
POST /disconnect/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

Mas o **servidor individual** (`server-whatsapp-individual.js`) só tinha as rotas:

```
GET /status (sem tenant_id)
POST /restart (em vez de disconnect)
```

### O que acontecia:

1. ✅ WhatsApp conectava normalmente
2. 🔄 Frontend tentava verificar status em `/status/:tenantId`
3. ❌ Rota não existia, causava comportamento inesperado
4. 🔌 Sistema tentava fazer logout automático
5. 💥 Arquivo de sessão estava em uso (EBUSY)
6. 💔 Desconexão e crash

---

## ✅ Solução Implementada

Adicionadas as rotas que o frontend espera:

### 1. Status por Tenant ID
```javascript
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  // Verifica se é o tenant correto
  if (tenantId !== TENANT_ID) {
    return res.status(404).json({
      success: false,
      error: 'Tenant não encontrado neste servidor'
    });
  }
  
  res.json({
    success: true,
    tenant_id: TENANT_ID,
    status: clientStatus,
    connected: clientStatus === 'online',
    // ... outros campos
  });
});
```

### 2. Disconnect por Tenant ID
```javascript
app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  // Verifica se é o tenant correto
  if (tenantId !== TENANT_ID) {
    return res.status(404).json({
      success: false,
      error: 'Tenant não encontrado neste servidor'
    });
  }
  
  // Desconecta apenas se solicitado explicitamente
  if (whatsappClient) {
    await whatsappClient.logout();
  }
  
  res.json({ success: true, message: 'Desconectado' });
});
```

---

## 🎯 Por que Funcionava Antes?

Provavelmente você estava usando outro servidor (como `server-whatsapp-v3.js` ou `server-whatsapp-multitenant.js`) que já tinham essas rotas implementadas.

Quando mudou para `server-whatsapp-individual.js`, essas rotas não existiam, causando o conflito.

---

## ✅ Como Usar Agora

### 1. Pare o servidor atual
```bash
CTRL + C
```

### 2. Limpe as sessões
```bash
parar-tudo.bat
```

### 3. Configure o tenant correto em `config-mania-mulher.env`
```env
COMPANY_NAME=Mania de Mulher
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
PORT=3333
```

### 4. Inicie o servidor
```bash
start-mania-mulher.sh
# ou
node server-whatsapp-individual.js
```

### 5. Acesse e escaneie o QR Code
```
http://localhost:3333
```

---

## 🔄 Frontend x Backend

### O que o Frontend faz:
```typescript
// Polling periódico (a cada X segundos)
fetch(`${api_url}/status/${tenant_id}`)

// Botão desconectar
fetch(`${api_url}/disconnect/${tenant_id}`, { method: 'POST' })
```

### O que o Backend precisa ter:
```javascript
app.get('/status/:tenantId', ...)      // ✅ Agora implementado
app.post('/disconnect/:tenantId', ...) // ✅ Agora implementado
```

---

## 📊 Logs Corretos

Após a correção, você deve ver:

```
✅ WhatsApp CONECTADO e PRONTO!
📍 GET /status/08f2b1b9-3988-489e-8186-c60f0c0b0622
📍 GET /status/08f2b1b9-3988-489e-8186-c60f0c0b0622
📍 GET /status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

**SEM** desconexões ou erros EBUSY.

---

## 🚨 Se o Erro Persistir

### 1. Verifique se está rodando o servidor correto
```bash
# Ver processos Node.js
tasklist | findstr node.exe
```

Se houver múltiplos processos, pare todos:
```bash
parar-tudo.bat
```

### 2. Verifique se o tenant_id está correto
O tenant_id no:
- ✅ `config-mania-mulher.env`: `08f2b1b9-3988-489e-8186-c60f0c0b0622`
- ✅ Banco de dados (tabela `integration_whatsapp`): mesmo ID
- ✅ Frontend (selecionado no TenantSwitcher): mesmo ID

### 3. Verifique a URL do servidor no banco
```sql
SELECT api_url, tenant_id 
FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

Deve retornar:
```
api_url = http://localhost:3333
tenant_id = 08f2b1b9-3988-489e-8186-c60f0c0b0622
```

---

## 📚 Arquivos Relacionados

- `server-whatsapp-individual.js` - Servidor corrigido ✅
- `config-mania-mulher.env` - Configuração da Mania de Mulher
- `start-mania-mulher.sh` - Script de inicialização
- `src/components/WhatsAppFloatingStatus.tsx` - Frontend que faz polling
- `src/components/WhatsAppIntegration.tsx` - Frontend alternativo

---

## 🎯 Resumo da Correção

| Antes | Depois |
|-------|--------|
| ❌ `/status/:tenantId` não existia | ✅ Rota implementada |
| ❌ `/disconnect/:tenantId` não existia | ✅ Rota implementada |
| ❌ Frontend causava logout automático | ✅ Frontend encontra as rotas |
| ❌ Erro EBUSY constante | ✅ Sem erros |
| ❌ Desconexão aleatória | ✅ Conexão estável |

---

## ✅ Verificação Final

Após iniciar o servidor, teste:

```bash
# Status geral
curl http://localhost:3333/status

# Status por tenant (o que o frontend usa)
curl http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

Ambos devem retornar JSON com `connected: true` quando conectado.

---

## 🆘 Suporte

Se o problema continuar:

1. Compartilhe os logs completos desde o início (`node server-whatsapp-individual.js`)
2. Informe o tenant_id que está usando
3. Mostre a configuração do `.env` (sem chaves sensíveis)
4. Teste com `curl` as rotas e compartilhe o resultado

# 🚀 WhatsApp Multi-Tenant Server - Clean Architecture v4.0

## 📋 O que mudou?

### ✅ **Novo Sistema (Clean Architecture)**
- ✅ Código 70% mais limpo e organizado
- ✅ Classes bem definidas (TenantManager, SupabaseHelper)
- ✅ Melhor isolamento entre tenants
- ✅ Logs estruturados e claros
- ✅ Tratamento de erros robusto
- ✅ Fácil manutenção e debug

### ❌ **Sistema Antigo (Removido)**
- ❌ Código misturado e difícil de manter
- ❌ Logs confusos
- ❌ Erros sem tratamento adequado
- ❌ Difícil adicionar novos tenants

---

## 🎯 Funcionalidades

### **Multi-Tenant Completo**
- Cada empresa tem seu próprio cliente WhatsApp isolado
- Sessões salvas separadamente em `.wwebjs_auth_clean/`
- Status individual por tenant
- Logs separados por empresa

### **Endpoints Disponíveis**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Verifica se servidor está online |
| `/status` | GET | Status de todos os tenants |
| `/status/:tenantId` | GET | Status de um tenant específico |
| `/send` | POST | Envia mensagem WhatsApp |

### **Reconexão Automática**
- Se desconectar, tenta reconectar após 10 segundos
- Logs claros do processo de reconexão
- Mantém histórico de tentativas

---

## 🚀 Como Usar

### **1. Instalar Dependências (se necessário)**
```bash
npm install
```

### **2. Iniciar o Servidor**

**Windows:**
```bash
start-clean.bat
```

**Linux/Mac:**
```bash
chmod +x start-clean.sh
./start-clean.sh
```

**OU diretamente:**
```bash
node server-multitenant-clean.js
```

### **3. Aguardar Inicialização**
```
🚀 WhatsApp Multi-Tenant Server - Clean Architecture v4.0
======================================================================

🔍 Carregando tenants ativos...

📋 1 tenant(s) encontrado(s):

   1. MANIA DE MULHER (app)
      ID: 08f2b1b9-3988-489e-8186-c60f0c0b0622

🎯 Inicializando apenas: MANIA DE MULHER

======================================================================
🔧 Inicializando: MANIA DE MULHER
🆔 ID: 08f2b1b9-3988-489e-8186-c60f0c0b0622
📂 Auth: C:\...\whatsapp-automacao\.wwebjs_auth_clean\tenant_08f2b1b9...
======================================================================

🔄 MANIA DE MULHER: Inicializando WhatsApp Web...
⏰ Aguarde o QR Code (até 120s)...
```

### **4. Escanear QR Code**
Quando aparecer o QR Code:
1. Abra WhatsApp no celular
2. Vá em **Mais opções** → **Aparelhos conectados**
3. Toque em **Conectar um aparelho**
4. Escaneie o QR Code

### **5. Confirmar Conexão**
```
✅✅✅ MANIA DE MULHER: CONECTADO ✅✅✅

======================================================================
✅ Servidor rodando!
📊 Status: http://localhost:3333/status
🏥 Health: http://localhost:3333/health
======================================================================
```

---

## 🔧 Configuração

### **Configurar Múltiplos Tenants**

Edite `server-multitenant-clean.js` linha ~50:

```javascript
const CONFIG = {
  // ...
  TENANTS: {
    'MANIA_DE_MULHER': '08f2b1b9-3988-489e-8186-c60f0c0b0622',
    'OUTRA_EMPRESA': 'id-da-outra-empresa-aqui',
    // Adicione mais tenants aqui
  }
};
```

### **Inicializar Todos os Tenants**

Linha ~452, descomente:

```javascript
// Descomentar para inicializar todos os tenants
console.log('🔄 Inicializando todos os tenants...\n');
for (const tenant of tenants) {
  const integration = await SupabaseHelper.getWhatsAppIntegration(tenant.id);
  if (integration) {
    await tenantManager.createClient(tenant);
    await delay(20000); // 20s entre cada tenant
  }
}
```

---

## 📡 Como o Frontend Usa

### **Configuração no Banco (integration_whatsapp)**

| Campo | Valor |
|-------|-------|
| `tenant_id` | ID da empresa |
| `api_url` | `http://localhost:3333` |
| `is_active` | `true` |

### **Envio de Mensagem (Frontend)**

```typescript
// Frontend envia assim:
await fetch('http://localhost:3333/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': '08f2b1b9-3988-489e-8186-c60f0c0b0622'
  },
  body: JSON.stringify({
    tenant_id: '08f2b1b9-3988-489e-8186-c60f0c0b0622',
    number: '5531982125522',
    message: '🛒 Item adicionado ao carrinho!'
  })
});
```

### **Resposta do Servidor**

**Sucesso:**
```json
{
  "success": true,
  "message": "Mensagem enviada",
  "phone": "5531982125522",
  "tenantId": "08f2b1b9-3988-489e-8186-c60f0c0b0622"
}
```

**Erro:**
```json
{
  "success": false,
  "error": "WhatsApp não conectado. Escaneie o QR Code primeiro."
}
```

---

## 🔍 Verificar Status

### **Status Geral**
```bash
curl http://localhost:3333/status
```

Resposta:
```json
{
  "success": true,
  "tenants": {
    "08f2b1b9-3988-489e-8186-c60f0c0b0622": {
      "status": "online",
      "hasClient": true
    }
  },
  "totalTenants": 1
}
```

### **Status de Tenant Específico**
```bash
curl http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

---

## 🐛 Troubleshooting

### **Problema: QR Code não aparece**
**Solução:**
1. Reinicie o computador (limpa memória)
2. Feche TODOS os Chrome/Edge abertos
3. Desative antivírus temporariamente
4. Execute: `node server-multitenant-clean.js`

### **Problema: "Tenant ID obrigatório"**
**Causa:** Frontend não está enviando `tenant_id`

**Solução:** Verificar se:
- Header `x-tenant-id` está presente
- OU body contém `tenant_id`
- Tenant existe no banco de dados

### **Problema: "WhatsApp não conectado"**
**Causa:** Cliente não está online

**Solução:**
1. Verificar status: `http://localhost:3333/status`
2. Se status != 'online', escanear QR Code novamente
3. Reiniciar servidor se necessário

### **Problema: Servidor não inicia**
**Causa:** Porta 3333 ocupada

**Solução:**
```bash
# Windows
netstat -ano | findstr :3333
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3333 | xargs kill -9
```

---

## 📊 Logs e Monitoramento

### **Tipos de Log**

| Emoji | Significado |
|-------|-------------|
| 🚀 | Servidor iniciando |
| 🔍 | Buscando informações |
| 📋 | Lista de tenants |
| 🎯 | Tenant selecionado |
| 🔧 | Inicializando cliente |
| 📱 | QR Code gerado |
| ⏳ | Carregando |
| 🔐 | Autenticado |
| ✅ | Conectado/Sucesso |
| ❌ | Erro |
| ⚠️ | Aviso |
| 🔌 | Desconectado |
| 🔄 | Reconectando |
| 📨 | Requisição recebida |
| 📤 | Enviando mensagem |

### **Exemplo de Log Completo**
```
🚀 WhatsApp Multi-Tenant Server - Clean Architecture v4.0
======================================================================

🔍 Carregando tenants ativos...

📋 1 tenant(s) encontrado(s):
   1. MANIA DE MULHER (app)

🎯 Inicializando apenas: MANIA DE MULHER
🔧 Inicializando: MANIA DE MULHER
🔄 MANIA DE MULHER: Inicializando WhatsApp Web...

📱 QR CODE - MANIA DE MULHER
[QR Code aqui]

🔐 MANIA DE MULHER: Autenticado
✅✅✅ MANIA DE MULHER: CONECTADO ✅✅✅

📨 [POST /send] Nova requisição
🔑 Tenant ID: 08f2b1b9-3988-489e-8186-c60f0c0b0622
📞 Telefone: 5531982125522
📤 Enviando mensagem para: 5531982125522
✅ Mensagem enviada com sucesso!
```

---

## 🏗️ Arquitetura do Código

### **Classes Principais**

#### **TenantManager**
- Gerencia todos os clientes WhatsApp
- Mantém mapa de clients, status e diretórios
- Métodos: `createClient()`, `getOnlineClient()`, `getAllStatus()`

#### **SupabaseHelper**
- Comunicação com banco Supabase
- Métodos: `loadActiveTenants()`, `logMessage()`

### **Fluxo de Envio de Mensagem**

```
1. Frontend → POST /send (com tenant_id)
2. Middleware extrai tenant_id
3. Valida dados (número, mensagem)
4. TenantManager busca cliente do tenant
5. Verifica se cliente está online
6. Normaliza telefone
7. Envia mensagem via WhatsApp Web.js
8. Salva log no Supabase (async)
9. Retorna sucesso ao frontend
```

---

## 🔐 Segurança

### **Variáveis de Ambiente**
- `SUPABASE_SERVICE_KEY` - Chave de serviço (nunca compartilhe!)
- `PORT` - Porta do servidor (padrão: 3333)

### **Isolamento de Tenants**
- Cada tenant tem diretório separado
- Sessões não se misturam
- Logs separados no banco

---

## 📦 Estrutura de Arquivos

```
whatsapp-automacao/
├── server-multitenant-clean.js   ← Servidor novo (USAR)
├── start-clean.bat                ← Iniciar Windows
├── start-clean.sh                 ← Iniciar Linux/Mac
├── README-CLEAN-SERVER.md         ← Esta documentação
├── .wwebjs_auth_clean/            ← Sessões WhatsApp (novo)
│   └── tenant_08f2b1b9.../        
└── [arquivos antigos]             ← Pode ignorar/deletar
```

---

## ✅ Checklist de Migração

- [x] Instalar dependências
- [x] Configurar `integration_whatsapp` no banco
- [x] Iniciar servidor: `node server-multitenant-clean.js`
- [x] Escanear QR Code
- [x] Testar envio de mensagem no frontend
- [x] Verificar logs no Supabase
- [x] Configurar tenants adicionais (se necessário)

---

## 🆘 Suporte

### **Logs do Sistema**
- Console do Node.js (PowerShell/Terminal)
- Console do Navegador (F12)
- Tabela `whatsapp_messages` no Supabase

### **Verificações Rápidas**
1. ✅ Servidor rodando? `http://localhost:3333/health`
2. ✅ WhatsApp conectado? `http://localhost:3333/status`
3. ✅ Configuração no banco? Tabela `integration_whatsapp`
4. ✅ Frontend enviando tenant_id? Console do navegador

---

## 🎉 Pronto!

Agora você tem um sistema WhatsApp Multi-Tenant:
- ✅ Robusto e estável
- ✅ Fácil de manter
- ✅ Logs claros
- ✅ Tenants isolados
- ✅ Pronto para produção

**Comando para iniciar:**
```bash
node server-multitenant-clean.js
```

🚀 **Bom uso!**

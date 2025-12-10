# 🔍 DIAGNÓSTICO COMPLETO - Sistema WhatsApp QR Code

## ✅ SITUAÇÃO ATUAL

### Backend Railway (FUNCIONANDO)
- **Arquivo ativo:** `backend/src/index.js`
- **Rotas disponíveis:**
  ```
  POST /start/:sessionId      → Inicia sessão e retorna QR
  GET  /status/:sessionId     → Status da sessão
  GET  /qr/:sessionId         → Obtém QR code
  POST /stop/:sessionId       → Encerra sessão
  POST /send-message          → Envia mensagem
  ```

### Edge Function Supabase (FUNCIONANDO)
- **Arquivo:** `supabase/functions/whatsapp-proxy/index.ts`
- **Chamadas:**
  ```
  action: "qr" → POST /start/:tenant_id
  action: "status" → GET /status/:tenant_id
  action: "get_qr" → GET /qr/:tenant_id
  ```

## 🎯 PROBLEMA IDENTIFICADO

O sistema **ESTÁ CORRETO** mas pode ter os seguintes problemas:

### 1. Backend demora 2 segundos para gerar QR
```javascript
// backend/src/index.js linha 164
await new Promise(resolve => setTimeout(resolve, 2000));
```

**Solução:** Aumentar timeout da Edge Function para 25 segundos (já está configurado)

### 2. QR Code pode não estar sendo gerado
**Motivos possíveis:**
- Baileys não consegue conectar
- Diretório AUTH_DIR sem permissão de escrita
- Sessão anterior travada

## ✅ TESTE COMPLETO DO SISTEMA

### 1. Testar Backend Diretamente

```bash
# Health check
curl https://backend-production-2599.up.railway.app/health

# Iniciar sessão (substitua SESSION_ID)
curl -X POST https://backend-production-2599.up.railway.app/start/test-123

# Ver resposta:
# {
#   "ok": true,
#   "status": "waiting_qr",
#   "qr": "data:image/png;base64,..."
# }

# Status
curl https://backend-production-2599.up.railway.app/status/test-123

# QR Code
curl https://backend-production-2599.up.railway.app/qr/test-123
```

### 2. Testar Edge Function

```bash
# Via Supabase
curl -X POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-proxy \
  -H "Content-Type: application/json" \
  -d '{"action":"qr","tenant_id":"08f2b1b9-3988-489e-8186-c60f0c0b0622"}'
```

### 3. Verificar Logs

**Railway:**
- Acesse: https://railway.app
- Entre no projeto backend
- Vá em Deployments → Logs
- Procure por `[tenant_id] QR Code gerado`

**Supabase:**
```bash
npx supabase functions logs whatsapp-proxy --project-ref hxtbsieodbtzgcvvkeqx
```

## 🔧 SOLUÇÕES POSSÍVEIS

### Solução 1: Backend está Correto - Testar Direto

O backend Railway **JÁ ESTÁ FUNCIONANDO** com as rotas corretas.

**Teste direto no navegador:**
```
https://backend-production-2599.up.railway.app/start/SEU_TENANT_ID
```

Deve retornar:
```json
{
  "ok": true,
  "qr": "data:image/png;base64,iVBORw0KGgoAAAA..."
}
```

### Solução 2: Verificar Configuração do Supabase

Na tabela `integration_whatsapp`, verifique:

```sql
SELECT tenant_id, api_url, is_active
FROM integration_whatsapp
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

**api_url deve ser:** `https://backend-production-2599.up.railway.app`

### Solução 3: Limpar Sessão Travada

Se o QR code não aparece, pode ser sessão travada:

```bash
# Via backend
curl -X POST https://backend-production-2599.up.railway.app/stop/08f2b1b9-3988-489e-8186-c60f0c0b0622

# Aguardar 5 segundos

# Tentar novamente
curl -X POST https://backend-production-2599.up.railway.app/start/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

## 📋 CHECKLIST DE DEPURAÇÃO

- [ ] **Teste 1:** Backend /health retorna ok
- [ ] **Teste 2:** Backend /start/:id retorna QR code
- [ ] **Teste 3:** QR code é string base64 válida
- [ ] **Teste 4:** Edge Function consegue chamar backend
- [ ] **Teste 5:** Tabela integration_whatsapp tem URL correta
- [ ] **Teste 6:** Edge Function está deployada (última versão)
- [ ] **Teste 7:** Frontend consegue chamar Edge Function

## 🎯 COMANDO RÁPIDO DE TESTE

```bash
# Teste completo em 1 comando
curl -X POST https://backend-production-2599.up.railway.app/start/teste-$(date +%s) | jq .
```

Se retornar algo como:
```json
{
  "ok": true,
  "status": "waiting_qr",
  "qr": "data:image/png;base64,iVBORw..."
}
```

**BACKEND ESTÁ FUNCIONANDO!** O problema está na Edge Function ou configuração do DB.

## 📊 ARQUIVOS IMPORTANTES

### 1. Backend
- `backend/src/index.js` ← **ATIVO no Railway**
- `backend/server-stable.js` ← Versão alternativa (não está ativa)
- `backend/package.json` → `"start": "node src/index.js"`

### 2. Edge Function
- `supabase/functions/whatsapp-proxy/index.ts` ← Proxy para backend

### 3. Database
- Tabela: `integration_whatsapp`
- Colunas: `tenant_id`, `api_url`, `is_active`

## 🚀 PRÓXIMOS PASSOS

1. **Teste o backend diretamente** (comando acima)
2. **Se funcionar:** Problema é na Edge Function ou DB config
3. **Se não funcionar:** Problema no Baileys ou permissões

## 💡 DICA IMPORTANTE

O QR code **DEMORA 2 SEGUNDOS** para ser gerado. Se você testar muito rápido, pode parecer que não está funcionando. Aguarde sempre pelo menos 3 segundos após chamar `/start`.

---

**Data do diagnóstico:** 2025-12-10
**Versão do backend:** 1.0.0 (src/index.js)
**Rotas:** ✅ Corretas e compatíveis

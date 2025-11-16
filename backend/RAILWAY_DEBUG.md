# Diagnóstico do Backend Railway

## 1. Verificar se o servidor está rodando

Acesse os **logs do Railway** e procure por:

```
🚀 WhatsApp Multi‑Tenant – v4.1 (lazy sessions)
▶️  HTTP 8080
```

Se não aparecer, o servidor não iniciou.

## 2. Testar Health Check

```bash
curl https://backend-production-2599.up.railway.app/health
```

**Resposta esperada:**
```json
{
  "ok": true,
  "status": "online",
  "time": "2025-11-16T...",
  "version": "4.1"
}
```

## 3. Testar Status de um Tenant

```bash
curl https://backend-production-2599.up.railway.app/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

**Resposta esperada:**
```json
{
  "ok": true,
  "tenantId": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
  "status": "not_found"
}
```

## 4. Iniciar Conexão

```bash
curl -X POST https://backend-production-2599.up.railway.app/connect \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 08f2b1b9-3988-489e-8186-c60f0c0b0622"
```

## 5. Obter QR Code

```bash
curl https://backend-production-2599.up.railway.app/qr \
  -H "x-tenant-id: 08f2b1b9-3988-489e-8186-c60f0c0b0622"
```

## 6. Variáveis de Ambiente Necessárias

No Railway, configure:

- `PORT` = 8080 (ou deixe vazio, Railway define automaticamente)
- `AUTH_DIR` = /data/.baileys_auth
- `SUPABASE_URL` = https://hxtbsieodbtzgcvvkeqx.supabase.co
- `SUPABASE_SERVICE_KEY` = (sua service role key do Supabase)
- `ALLOWED_ORIGINS` = *

## 7. Volume para Sessões (Opcional mas Recomendado)

Monte um volume no Railway em `/data` para persistir as sessões do WhatsApp.

## 8. Logs Detalhados

Com os logs adicionados, você verá:
- `📡 [GET /qr]` - Requisições para obter QR
- `📡 [POST /connect]` - Requisições para conectar
- `📡 [GET /status/:tenantId]` - Requisições de status
- `🔄 [POST /reset]` - Requisições para resetar

## 9. Problemas Comuns

### 404 em todas as rotas
- Servidor não está rodando
- Dockerfile não está executando o comando correto
- `npm start` não está configurado no package.json

### Timeout ao gerar QR
- WhatsApp está demorando para gerar o QR
- Chromium não está instalado corretamente
- Verifique logs do Railway para erros do Puppeteer

### "Tenant não resolvido"
- Header `x-tenant-id` não está sendo enviado
- Tenant ID não é um UUID válido

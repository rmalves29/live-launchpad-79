# 📱 Setup Completo WhatsApp - Guia Definitivo

## Visão Geral

Sistema multi-tenant de WhatsApp usando Baileys, com backend no Railway e frontend/proxy no Supabase.

```
┌─────────────┐
│  Frontend   │
│  (Lovable)  │
└──────┬──────┘
       │
       ↓
┌─────────────────┐
│  Edge Function  │
│ (whatsapp-proxy)│
└──────┬──────────┘
       │ timeout: 45s
       ↓
┌──────────────────┐
│ Railway Backend  │
│ (server-stable)  │
└──────┬───────────┘
       │ timeout: 90s
       ↓
┌──────────────┐
│  WhatsApp    │
│  (Baileys)   │
└──────────────┘
```

## Passo 1: Configurar Railway

### 1.1 Criar Projeto
1. Acesse https://railway.app
2. Crie novo projeto
3. Connect GitHub repository ou deploy manual

### 1.2 Configurar Variáveis de Ambiente

No Railway → Settings → Variables:

```env
# Porta (Railway configura automaticamente, mas pode definir)
PORT=8080

# Diretório de autenticação Baileys
AUTH_DIR=/data/.baileys_auth

# Supabase (OBRIGATÓRIO)
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc... (sua service role key)
```

**Como obter SUPABASE_SERVICE_KEY:**
1. Supabase Dashboard → Settings → API
2. Copiar "service_role" key (NÃO o anon key!)

### 1.3 Configurar Volume (IMPORTANTE!)

Para persistir sessões do WhatsApp entre deploys:

1. Railway → Settings → Volumes
2. Add Volume:
   - **Mount Path**: `/data`
   - **Size**: 1GB mínimo (5GB recomendado)

**⚠️ SEM VOLUME**: As sessões serão perdidas a cada deploy!

### 1.4 Configurar Root Directory

Se seu projeto tem estrutura com pastas `frontend/` e `backend/`:

1. Railway → Settings → Root Directory
2. Definir: `backend`

### 1.5 Verificar Build

Railway deve:
1. Detectar `package.json` automaticamente
2. Executar `npm install`
3. Executar `npm start` (que roda `server-stable.js`)

**Logs esperados:**
```
🚀 WhatsApp Multi-Tenant v5.0 STABLE
📂 Auth: /data/.baileys_auth
🌐 Port: 8080
✅ Servidor pronto para conexões
```

### 1.6 Obter URL do Backend

1. Railway → Settings → Domains
2. Gerar domínio Railway ou adicionar custom domain
3. URL será algo como: `https://backend-production-XXXX.up.railway.app`

**Copie essa URL!** Você vai precisar dela no próximo passo.

## Passo 2: Configurar Supabase

### 2.1 Criar Tabela de Integração (se não existe)

```sql
-- Verificar se existe
SELECT * FROM integration_whatsapp LIMIT 1;

-- Se não existir, criar:
CREATE TABLE IF NOT EXISTS integration_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  instance_name TEXT NOT NULL,
  api_url TEXT,
  webhook_secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE integration_whatsapp ENABLE ROW LEVEL SECURITY;

-- Política para tenants verem suas integrações
CREATE POLICY "Tenants can view own integration"
  ON integration_whatsapp FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Política para tenants atualizarem suas integrações
CREATE POLICY "Tenants can update own integration"
  ON integration_whatsapp FOR UPDATE
  USING (tenant_id = get_current_tenant_id());
```

### 2.2 Inserir Configuração do Tenant

Para cada tenant que usará WhatsApp:

```sql
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active
) VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622', -- ID do tenant
  'tenant_orderzaps',                      -- Nome da instância
  'https://backend-production-XXXX.up.railway.app', -- URL do Railway
  gen_random_uuid()::text,                 -- Secret aleatório
  true
)
ON CONFLICT (tenant_id) DO UPDATE SET
  api_url = EXCLUDED.api_url,
  updated_at = now();
```

**⚠️ IMPORTANTE:**
- Substituir `tenant_id` pelo ID real do seu tenant
- Substituir `api_url` pela URL do seu Railway (do Passo 1.6)

### 2.3 Verificar Edge Function

A edge function `whatsapp-proxy` já deve estar deployada. Verificar:

```sql
-- Testar edge function
SELECT * FROM functions.whatsapp-proxy;
```

Se não existir, ela será criada automaticamente no próximo deploy do Lovable.

## Passo 3: Testar Conexão

### 3.1 Health Check

```bash
curl https://backend-production-XXXX.up.railway.app/health
```

**Resposta esperada:**
```json
{
  "ok": true,
  "status": "online",
  "version": "5.0-stable",
  "uptime": 60,
  "memory": { "heap": 50, "rss": 100 },
  "tenants": { "total": 0, "online": 0 }
}
```

### 3.2 Testar via Edge Function

```bash
# Via frontend (substitua TENANT_ID)
curl -X POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-proxy \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d '{
    "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
    "action": "connect"
  }'
```

**Resposta esperada:**
```json
{
  "ok": true,
  "tenantId": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
  "status": "connecting"
}
```

### 3.3 Obter QR Code

Aguardar 5-10 segundos, depois:

```bash
curl -X POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-proxy \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d '{
    "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
    "action": "qr"
  }'
```

**Respostas possíveis:**

**1. QR disponível:**
```json
{
  "ok": true,
  "tenantId": "...",
  "qr": "2@...",
  "qrDataURL": "data:image/png;base64,..."
}
```

**2. QR ainda não pronto:**
```
Status: 204 No Content
```
*Aguarde 3-5 segundos e tente novamente*

**3. Cooldown ativo:**
```json
{
  "ok": false,
  "status": "cooldown",
  "cooldownRemaining": 10
}
```
*Status: 429 - Aguarde os minutos indicados*

## Passo 4: Usar no Frontend

### 4.1 Página de Conexão

O frontend já tem a página `/whatsapp/conexao` implementada.

Ela faz automaticamente:
1. Busca configuração do tenant no Supabase
2. Chama edge function `whatsapp-proxy` com action `connect`
3. Faz polling a cada 5 segundos para buscar QR
4. Exibe QR code quando disponível
5. Detecta quando usuário escaneia e conecta

### 4.2 Fluxo de Uso

1. Usuário acessa `/whatsapp/conexao`
2. Frontend exibe "Gerando QR Code..."
3. Após 5-15 segundos, QR aparece
4. Usuário escaneia com WhatsApp
5. Conexão estabelecida → "Conectado!"

### 4.3 Tratamento de Erros

**Cooldown 405:**
```tsx
if (data?.cooldownRemaining) {
  toast({
    title: "⏰ Cooldown Ativo",
    description: `Aguarde ${data.cooldownRemaining} minutos`,
    variant: "destructive"
  });
}
```

**Timeout:**
```tsx
if (waitingTime > 120) {
  setHasTimedOut(true);
  // Mostrar botão "Tentar Novamente"
}
```

**Reconnect Required:**
```tsx
if (data?.status === 'reconnect_required') {
  // Chamar initializeConnection() automaticamente
  await initializeConnection();
}
```

## Troubleshooting

### ❌ "WhatsApp integration not configured"

**Causa:** Registro não existe em `integration_whatsapp`

**Solução:** Execute o SQL do Passo 2.2

### ❌ "Cooldown ativo após erro 405"

**Causa:** WhatsApp bloqueou IP temporariamente

**Solução:**
1. Aguardar 15 minutos
2. Não fazer múltiplas tentativas (piora o bloqueio)
3. Após cooldown, tentar novamente

**Prevenção:**
- Evitar conectar/desconectar repetidamente
- Manter conexões estáveis
- Usar `/reset` apenas quando necessário

### ❌ QR não aparece após 2 minutos

**Causa:** Backend pode ter crashado ou erro no Baileys

**Soluções:**
1. Verificar logs do Railway
2. Verificar `/health` do backend
3. Tentar `/reset` seguido de nova conexão

### ❌ Backend crashando com SIGTERM

**Causa:** Usando versão antiga do servidor

**Solução:**
1. Verificar `backend/package.json` aponta para `server-stable.js`
2. Redeploy no Railway
3. Verificar logs mostram "v5.0 STABLE"

### ❌ "Request timeout após Xms"

**Causa:** Backend Railway não respondeu a tempo

**Soluções:**
1. Verificar se backend está online (`/health`)
2. Problema pode ser temporário de rede
3. Frontend deve ter retry automático

### ❌ Sessões perdidas após deploy

**Causa:** Volume não configurado

**Solução:** Configure volume no Railway (Passo 1.3)

## Monitoramento

### Logs do Railway

Acompanhe em tempo real:
```
Railway → Deployments → View Logs
```

**Logs importantes:**

✅ **Startup bem-sucedido:**
```
🚀 WhatsApp Multi-Tenant v5.0 STABLE
✅ Diretório de autenticação: /data/.baileys_auth
✅ Servidor pronto para conexões
```

✅ **Conexão bem-sucedida:**
```
🔧 Criando sessão para: TENANT_NAME
✅ Estado carregado
📱 QR gerado para tenant_slug
✅ tenant_slug: CONECTADO
```

❌ **Erro 405:**
```
❌ tenant_slug: DESCONECTADO
📊 Status Code: 405
⚠️  Erro 405: WhatsApp bloqueou o IP temporariamente
```

### Health Check Periódico

Configure um monitor (UptimeRobot, etc) para:

```
GET https://backend-production-XXXX.up.railway.app/health
Interval: 5 minutos
```

### Supabase Logs

Verificar logs da edge function:

1. Supabase Dashboard → Functions → whatsapp-proxy
2. Clicar em "Logs"
3. Ver requisições e erros

## Recursos Adicionais

### Documentação Completa

- `/backend/NOVA_ARQUITETURA.md` - Arquitetura detalhada
- `/backend/RAILWAY_CONFIG.md` - Configuração Railway antiga
- `/backend/RAILWAY_DEBUG.md` - Debug Railway Baileys

### Endpoints do Backend

```
GET  /health                    - Health check
GET  /status/:tenantId         - Status da conexão
POST /connect                  - Iniciar conexão
GET  /qr                       - Obter QR code
POST /reset/:tenantId          - Resetar sessão
```

### Suporte

Em caso de problemas persistentes:

1. Verificar logs do Railway
2. Verificar logs da edge function
3. Verificar logs do navegador (console)
4. Consultar documentação do Baileys: https://whiskeysockets.github.io/Baileys/

## Checklist Final

- [ ] Railway configurado com variáveis corretas
- [ ] Volume `/data` criado no Railway
- [ ] Backend mostrando "v5.0 STABLE" nos logs
- [ ] `integration_whatsapp` table existe no Supabase
- [ ] Registro do tenant inserido com `api_url` correto
- [ ] `/health` retorna status `online`
- [ ] Edge function `whatsapp-proxy` deployada
- [ ] Frontend consegue chamar edge function
- [ ] QR code aparece no frontend
- [ ] Escanear QR conecta com sucesso

**Tudo pronto!** 🎉

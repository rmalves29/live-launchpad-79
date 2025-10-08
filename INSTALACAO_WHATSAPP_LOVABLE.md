# 📱 Instalação e Configuração - WhatsApp no Lovable

## 📋 Visão Geral

Este guia explica como integrar o servidor WhatsApp de instância única com seu sistema Lovable.

## 🎯 Arquitetura

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Lovable App   │  HTTP   │  Node WhatsApp   │  WebAPI │   WhatsApp      │
│   (Frontend)    │────────▶│     Server       │────────▶│   Servers       │
│                 │         │  (Port 3333)     │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
         │                           │
         │      Supabase DB          │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │  Supabase   │
              │  Database   │
              └─────────────┘
```

## 📦 Pré-requisitos

### 1. Node.js e dependências
```bash
# Verificar Node.js (versão 18 ou superior)
node --version

# Instalar dependências do servidor WhatsApp
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

### 2. Chrome ou Edge instalado
O WhatsApp Web.js precisa de um navegador Chromium para funcionar.

## 🚀 Passo 1: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (mesmo nível do `whatsapp-server-single.js`):

```env
# URL do Supabase (mesma do seu projeto Lovable)
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co

# Service Role Key (encontre em: Supabase Dashboard > Settings > API)
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui

# Porta do servidor (opcional, padrão: 3333)
PORT=3333
```

⚠️ **IMPORTANTE**: 
- Nunca commite o arquivo `.env` no Git
- A `SUPABASE_SERVICE_ROLE_KEY` deve ser mantida em segredo
- Adicione `.env` ao seu `.gitignore`

## 🚀 Passo 2: Configurar no Banco de Dados

Execute este SQL no Supabase para configurar a integração:

```sql
-- Inserir/Atualizar configuração do WhatsApp
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  is_active,
  webhook_secret
) VALUES (
  'SEU_TENANT_ID_AQUI', -- Substitua pelo ID do seu tenant
  'Lovable WhatsApp',
  'http://localhost:3333', -- URL do servidor Node.js
  true,
  'webhook-secret-123' -- Pode ser qualquer string secreta
)
ON CONFLICT (tenant_id) 
DO UPDATE SET 
  api_url = 'http://localhost:3333',
  is_active = true,
  updated_at = now();
```

Para encontrar seu `tenant_id`:
```sql
-- Listar todos os tenants
SELECT id, name, slug FROM tenants;
```

## 🚀 Passo 3: Iniciar o Servidor WhatsApp

```bash
# Na raiz do projeto, onde está o whatsapp-server-single.js
node whatsapp-server-single.js
```

Você verá:
```
============================================================
🚀 SERVIDOR WHATSAPP LOVABLE
============================================================
🌐 URL: http://localhost:3333
📊 Status: http://localhost:3333/status
📋 Logs: http://localhost:3333/logs
============================================================

✅ Servidor rodando na porta 3333

============================================================
📱 QR CODE - LOVABLE WHATSAPP
============================================================
```

## 📱 Passo 4: Conectar WhatsApp

1. **Escaneie o QR Code** que apareceu no terminal
2. Abra o **WhatsApp no celular**
3. Vá em **Configurações > Aparelhos conectados**
4. Toque em **Conectar um aparelho**
5. Escaneie o QR Code
6. Aguarde a mensagem: `✅ Cliente WhatsApp pronto!`

## ✅ Passo 5: Testar a Integração

### Testar diretamente no servidor:

```bash
# Status
curl http://localhost:3333/status

# Enviar mensagem teste
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "11999999999",
    "message": "Teste de integração Lovable"
  }'
```

### Testar no sistema Lovable:

Vá até a página de **Configurações > WhatsApp** no seu sistema e clique em **Testar Conexão**.

## 🔧 Comandos Úteis

### PowerShell (Windows)

```powershell
# Verificar se servidor está rodando
Invoke-RestMethod -Uri "http://localhost:3333/status"

# Ver logs
Invoke-RestMethod -Uri "http://localhost:3333/logs"

# Enviar mensagem teste
$body = @{
    phone = "11999999999"
    message = "Teste"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3333/send" -Method POST -Body $body -ContentType "application/json"
```

### Bash (Linux/Mac)

```bash
# Verificar se servidor está rodando
curl http://localhost:3333/status

# Ver logs
curl http://localhost:3333/logs

# Enviar mensagem teste
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "11999999999", "message": "Teste"}'
```

## 📊 Endpoints Disponíveis

### GET /status
Retorna o status do servidor WhatsApp.

**Resposta:**
```json
{
  "status": "online",
  "number": "5511999999999",
  "online": true,
  "timestamp": "2025-10-08T04:00:00.000Z"
}
```

### GET /logs
Retorna os últimos logs do servidor.

**Resposta:**
```json
{
  "logs": [
    {
      "timestamp": "2025-10-08T04:00:00.000Z",
      "type": "success",
      "message": "Mensagem enviada para 11999999999",
      "phone": "11999999999",
      "messageId": "msg-1234567890-abc"
    }
  ],
  "total": 50
}
```

### POST /send
Envia uma mensagem para um número.

**Requisição:**
```json
{
  "phone": "11999999999",
  "message": "Sua mensagem aqui"
}
```

**Resposta:**
```json
{
  "success": true,
  "messageId": "msg-1234567890-abc",
  "phone": "11999999999"
}
```

### POST /broadcast
Envia a mesma mensagem para múltiplos números.

**Requisição:**
```json
{
  "phones": ["11999999999", "11888888888", "11777777777"],
  "message": "Mensagem para todos"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Enviando para 3 números",
  "total": 3
}
```

### POST /send-product-canceled
Envia mensagem de produto cancelado (usado pelo sistema).

**Requisição:**
```json
{
  "phone": "11999999999",
  "productName": "Camiseta Azul",
  "productCode": "CAM-001"
}
```

## 🔍 Solução de Problemas

### Problema: QR Code não aparece

**Solução:**
```bash
# 1. Parar o servidor
Ctrl + C

# 2. Limpar sessão antiga
Remove-Item -Recurse -Force .wwebjs_auth  # Windows
rm -rf .wwebjs_auth                        # Linux/Mac

# 3. Reiniciar
node whatsapp-server-single.js
```

### Problema: "Cliente não está online"

**Verificar:**
1. Servidor está rodando? `curl http://localhost:3333/status`
2. Status é "online"? Se não, escaneie o QR novamente
3. Chrome/Edge está instalado?

**Solução:**
```bash
# Ver logs detalhados
curl http://localhost:3333/logs
```

### Problema: Mensagens não enviam

**Verificar:**
1. Número está correto? (com DDD, sem caracteres especiais)
2. Rate limit não foi atingido? (aguarde 4 segundos entre mensagens)
3. WhatsApp está conectado no celular?

**Testar:**
```bash
# Ver status do cliente
curl http://localhost:3333/status

# Ver logs de erro
curl http://localhost:3333/logs
```

### Problema: "WhatsApp server is offline" no Lovable

**Solução:**
1. Verificar se servidor Node.js está rodando: `curl http://localhost:3333/health`
2. Verificar URL no banco de dados (deve ser `http://localhost:3333`)
3. Verificar firewall não está bloqueando porta 3333

## 🔒 Segurança

### Produção

Para produção, você deve:

1. **Usar HTTPS** em vez de HTTP
2. **Proteger com autenticação** (token, JWT, etc.)
3. **Usar um serviço de gerenciamento de processos** (PM2, systemd)
4. **Configurar reverse proxy** (nginx, Apache)
5. **Habilitar logs persistentes**

### Exemplo com PM2:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar servidor com PM2
pm2 start whatsapp-server-single.js --name "whatsapp-lovable"

# Auto-start no boot
pm2 startup
pm2 save

# Monitorar
pm2 monit

# Ver logs
pm2 logs whatsapp-lovable
```

## 📝 Notas Importantes

1. **Uma sessão por vez**: WhatsApp Web só permite uma conexão ativa por número
2. **Rate Limits**: Respeite os limites (4 segundos entre mensagens)
3. **Backup da sessão**: A pasta `.wwebjs_auth` guarda sua sessão
4. **Termos de Uso**: Use apenas para comunicação legítima, não para spam
5. **Produção**: Em produção, rode o servidor em um serviço dedicado (não localhost)

## 🆘 Suporte

Se encontrar problemas:

1. Verifique os logs: `curl http://localhost:3333/logs`
2. Veja o console do servidor Node.js
3. Consulte a documentação do WhatsApp Web.js
4. Abra uma issue no repositório

## ✅ Checklist de Instalação

- [ ] Node.js 18+ instalado
- [ ] Dependências instaladas (`npm install`)
- [ ] Arquivo `.env` configurado
- [ ] Banco de dados configurado (SQL executado)
- [ ] Servidor iniciado (`node whatsapp-server-single.js`)
- [ ] QR Code escaneado
- [ ] Status "online" confirmado
- [ ] Mensagem de teste enviada com sucesso
- [ ] Integração testada no sistema Lovable

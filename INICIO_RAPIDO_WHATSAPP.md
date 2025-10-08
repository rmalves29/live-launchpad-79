# 🚀 Início Rápido - WhatsApp Lovable

## ⚡ 3 Passos para Conectar

### 1️⃣ Instalar Dependências

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

### 2️⃣ Configurar e Iniciar

```bash
# Criar arquivo .env
echo "SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co" > .env
echo "SUPABASE_SERVICE_ROLE_KEY=sua-chave-aqui" >> .env
echo "PORT=3333" >> .env

# Iniciar servidor
node whatsapp-server-single.js
```

### 3️⃣ Escanear QR Code

- Aguarde o QR Code aparecer no terminal
- Abra WhatsApp no celular
- Escaneie o código
- Aguarde "✅ Cliente WhatsApp pronto!"

## 📊 Verificar Status

```bash
# Status do servidor
curl http://localhost:3333/status

# Ver logs
curl http://localhost:3333/logs
```

## ✅ Testar Envio

```bash
# Enviar mensagem teste
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "11999999999", "message": "Teste!"}'
```

## 🔧 Configurar no Sistema

Execute este SQL no Supabase:

```sql
-- Configurar WhatsApp no banco
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  is_active,
  webhook_secret
) VALUES (
  (SELECT id FROM tenants LIMIT 1), -- Seu tenant
  'Lovable WhatsApp',
  'http://localhost:3333',
  true,
  'webhook-secret-123'
);
```

## 📚 Documentação Completa

Veja `INSTALACAO_WHATSAPP_LOVABLE.md` para:
- Configuração detalhada
- Solução de problemas
- Deploy em produção
- Todos os endpoints disponíveis

## 🆘 Problemas?

### QR Code não aparece
```bash
Remove-Item -Recurse -Force .wwebjs_auth  # Windows
rm -rf .wwebjs_auth                        # Linux/Mac
node whatsapp-server-single.js
```

### "Cliente não está online"
```bash
# Ver logs
curl http://localhost:3333/logs

# Verificar status
curl http://localhost:3333/status
```

### Servidor não inicia
```bash
# Verificar porta disponível
netstat -ano | findstr :3333  # Windows
lsof -i :3333                  # Linux/Mac

# Usar outra porta
$env:PORT=3334; node whatsapp-server-single.js  # Windows
PORT=3334 node whatsapp-server-single.js        # Linux/Mac
```

## ✨ Pronto!

Agora seu sistema Lovable pode enviar mensagens WhatsApp! 🎉

Acesse: **Configurações > WhatsApp** no sistema para testar.

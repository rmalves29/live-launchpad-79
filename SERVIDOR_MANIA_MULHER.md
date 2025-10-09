# 🚀 Servidor WhatsApp - MANIA DE MULHER

## 📋 Descrição

Servidor Node.js **dedicado** exclusivamente para o tenant **MANIA DE MULHER**.

Este servidor roda de forma independente e gerencia apenas as conexões WhatsApp deste tenant específico.

---

## ✅ Vantagens do Servidor Dedicado

- 🎯 **Focado**: Gerencia apenas 1 tenant
- ⚡ **Mais rápido**: Sem competição por recursos
- 🔧 **Mais estável**: Sem timeouts multi-tenant
- 📊 **Mais simples**: Logs e debug mais fáceis
- 🔒 **Isolado**: Problemas não afetam outros tenants

---

## 🚀 Como Iniciar

### No Windows:
```cmd
start-mania-mulher.bat
```

### No Linux/Mac:
```bash
chmod +x start-mania-mulher.sh
./start-mania-mulher.sh
```

### Diretamente:
```bash
node server-whatsapp-mania-mulher.js
```

---

## 📊 Informações do Servidor

- **Nome do Tenant**: MANIA DE MULHER
- **Tenant ID**: 08f2b1b9-3988-489e-8186-c60f0c0b0622
- **Porta**: 3334
- **URL**: http://localhost:3334
- **Pasta de sessão**: `.wwebjs_auth_mania_mulher`

---

## 🔧 Endpoints Disponíveis

### Status
```bash
GET http://localhost:3334/status
```
Retorna o status da conexão WhatsApp

### Enviar Mensagem
```bash
POST http://localhost:3334/send
{
  "phone": "11999999999",
  "message": "Olá!"
}
```

### Broadcast (Múltiplos Destinatários)
```bash
POST http://localhost:3334/broadcast
{
  "phones": ["11999999999", "11988888888"],
  "message": "Mensagem em massa"
}
```

### Listar Grupos
```bash
GET http://localhost:3334/list-all-groups
```
Retorna todos os grupos do WhatsApp conectado

### Enviar para Grupo
```bash
POST http://localhost:3334/send-to-group
{
  "groupId": "123456789@g.us",
  "message": "Mensagem para o grupo"
}
```

### Health Check
```bash
GET http://localhost:3334/health
```

---

## 📱 Conectar WhatsApp

1. Inicie o servidor
2. Aguarde o QR Code aparecer no terminal
3. Abra o WhatsApp no celular
4. Vá em **Configurações > Aparelhos conectados**
5. Toque em **Conectar um aparelho**
6. Escaneie o QR Code
7. Aguarde a confirmação: ✅ WhatsApp conectado!

---

## 🔄 Configurar no Sistema

Para que o sistema use este servidor, atualize a tabela `integration_whatsapp` no Supabase:

```sql
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3334'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

Ou pelo Supabase Dashboard:
1. Acesse a tabela `integration_whatsapp`
2. Encontre o registro da MANIA DE MULHER
3. Edite o campo `api_url` para: `http://localhost:3334`
4. Marque `is_active` como `true`

---

## 🛠️ Solução de Problemas

### QR Code não aparece
```bash
# Limpar sessão antiga
rmdir /s /q .wwebjs_auth_mania_mulher  (Windows)
rm -rf .wwebjs_auth_mania_mulher       (Linux/Mac)

# Reiniciar
node server-whatsapp-mania-mulher.js
```

### Erro de porta em uso
```bash
# Verificar o que está usando a porta 3334
netstat -ano | findstr :3334  (Windows)
lsof -i :3334                  (Linux/Mac)

# Matar o processo
taskkill /PID <PID> /F         (Windows)
kill -9 <PID>                  (Linux/Mac)
```

### Desconexões frequentes
- Verifique a conexão de internet
- Mantenha o WhatsApp do celular online
- Não deslogue do WhatsApp Web manualmente

---

## 📊 Monitoramento

### Ver Status em Tempo Real
```bash
# Em outro terminal, execute:
curl http://localhost:3334/status

# Resposta esperada:
{
  "success": true,
  "tenant": "MANIA DE MULHER",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
  "status": "online",
  "whatsapp_state": "CONNECTED",
  "connected": true
}
```

---

## 🔄 Reiniciar o Servidor

1. Pressione `CTRL + C` no terminal
2. Execute novamente: `start-mania-mulher.bat`
3. Se já estava conectado, conectará automaticamente (sem QR Code)
4. Se precisar reconectar, escaneie o novo QR Code

---

## 💡 Dicas

✅ **Deixe o terminal aberto** enquanto usar o WhatsApp
✅ **Mantenha o celular conectado** à internet
✅ **Não desconecte** do WhatsApp Web manualmente
✅ **Monitore os logs** para detectar problemas

❌ **Não feche o terminal** enquanto usar o sistema
❌ **Não use o mesmo número** em múltiplos servidores
❌ **Não escaneie o QR Code** se já está conectado

---

## 🔧 Outros Servidores

Se você tem outros tenants, pode criar servidores dedicados seguindo este modelo:

1. Copie `server-whatsapp-mania-mulher.js`
2. Altere `TENANT_ID` e `TENANT_NAME`
3. Altere a `PORT` (ex: 3335, 3336, etc.)
4. Crie um novo script de start
5. Atualize a `api_url` no banco de dados

---

## 📝 Logs

O servidor mostra logs detalhados no terminal:

- 📱 QR Code gerado
- 🔐 Autenticação bem-sucedida
- ✅ WhatsApp conectado
- 📤 Mensagens enviadas
- 📥 Mensagens recebidas
- ❌ Erros e falhas

---

## 🆘 Suporte

Se tiver problemas:

1. Verifique os logs no terminal
2. Teste o endpoint `/status`
3. Limpe a sessão e tente novamente
4. Consulte `SOLUCAO_TIMEOUT.md` para problemas comuns

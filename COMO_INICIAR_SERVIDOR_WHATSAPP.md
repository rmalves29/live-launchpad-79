# 🚀 Como Iniciar o Servidor WhatsApp

## ⚠️ IMPORTANTE

Para que a conexão WhatsApp funcione no site, você precisa ter um servidor Node.js rodando que gerencia as conexões WhatsApp usando a biblioteca `whatsapp-web.js`.

## 📋 Pré-requisitos

1. **Node.js instalado** (versão 16 ou superior)
2. **Servidor WhatsApp configurado** (você já tem os arquivos: `server-whatsapp-v3.js`, `server-whatsapp-multitenant.js`, etc.)
3. **Porta 3333 disponível** (ou outra porta configurada)

## 🔧 Passo 1: Configurar o Banco de Dados

Antes de iniciar o servidor, configure a URL do servidor na tabela `integration_whatsapp`:

```sql
-- Para cada tenant (empresa), inserir ou atualizar:
INSERT INTO integration_whatsapp (
  tenant_id, 
  instance_name, 
  api_url, 
  webhook_secret, 
  is_active
) VALUES (
  'uuid-do-tenant',
  'NOME_DA_EMPRESA',
  'http://localhost:3333',  -- ou IP do servidor
  'secret_qualquer',
  true
)
ON CONFLICT (tenant_id) 
DO UPDATE SET 
  api_url = 'http://localhost:3333',
  is_active = true;
```

**Importante**: 
- Se o servidor está na sua máquina local, use `http://localhost:3333`
- Se o servidor está em outro computador/servidor, use `http://IP_DO_SERVIDOR:3333`
- Se usar HTTPS, troque `http` por `https`

## 🚀 Passo 2: Iniciar o Servidor

### Opção 1: Servidor Multi-Tenant (Recomendado)

Para gerenciar múltiplas empresas em um único servidor:

**Windows:**
```bash
start-multitenant.bat
```

**Linux/Mac:**
```bash
chmod +x start-multitenant.sh
./start-multitenant.sh
```

### Opção 2: Servidor Individual

Para uma única empresa:

**Windows:**
```bash
start-windows.bat
```

**Linux/Mac:**
```bash
chmod +x start-v3.sh
./start-v3.sh
```

### Opção 3: Manualmente via Node

```bash
# Multi-tenant
node server-whatsapp-multitenant.js

# Ou v3
node server-whatsapp-v3.js
```

## ✅ Passo 3: Verificar se Está Rodando

Após iniciar, você deve ver algo assim:

```
🚀 Iniciando Sistema Multi-Tenant
==================================
📦 Instalando dependências...
📁 Criando diretório de sessões...
🌐 Servidor rodará na porta: 3333
📊 Status: http://localhost:3333/status

🚀 Iniciando servidor...
✅ Servidor WhatsApp Multi-Tenant rodando na porta 3333
```

Teste acessando: `http://localhost:3333/health`

Você deve receber: `{ "status": "ok" }`

## 🌐 Passo 4: Conectar no Site

Agora que o servidor está rodando:

1. Acesse o site
2. Clique no botão "WhatsApp" (canto inferior direito)
3. Clique em "Conectar WhatsApp"
4. Escaneie o QR Code que aparecer
5. Aguarde a confirmação de conexão

## 🔍 Verificando Status

### Via Site
- Botão flutuante "WhatsApp" mostra status em tempo real
- Verde = Conectado
- Vermelho = Desconectado

### Via API
```bash
# Status de um tenant específico
curl http://localhost:3333/status/TENANT_ID

# Status geral (multi-tenant)
curl http://localhost:3333/status
```

## 🐛 Problemas Comuns

### 1. "Servidor WhatsApp não está rodando"

**Causa**: O servidor Node.js não está ativo.

**Solução**: 
- Inicie o servidor conforme Passo 2
- Verifique se a porta 3333 está livre: `netstat -ano | findstr :3333` (Windows) ou `lsof -i :3333` (Linux/Mac)

### 2. "Erro ao conectar WebSocket"

**Causa**: URL do servidor incorreta ou servidor não acessível.

**Solução**:
- Verifique a URL em `integration_whatsapp` no banco
- Se usar localhost, o navegador e servidor devem estar na mesma máquina
- Se usar IP externo, certifique-se que a porta está aberta no firewall

### 3. "Configuração de WhatsApp não encontrada"

**Causa**: Não existe registro na tabela `integration_whatsapp` para este tenant.

**Solução**:
- Execute o SQL do Passo 1 para criar a configuração
- Certifique-se de usar o `tenant_id` correto

### 4. QR Code não aparece

**Causa**: Servidor não está enviando eventos via WebSocket.

**Solução**:
- Verifique logs do servidor Node.js
- Certifique-se que o WebSocket está configurado corretamente
- Tente reiniciar o servidor

### 5. "Timeout: Servidor WhatsApp não respondeu"

**Causa**: Servidor muito lento ou travado.

**Solução**:
- Reinicie o servidor
- Verifique se há muitos clientes conectados
- Aumente recursos da máquina (RAM, CPU)

## 📝 Logs

### No Servidor Node.js
Todos os eventos são logados no console onde o servidor está rodando.

### No Banco de Dados
Consulte a tabela `whatsapp_connection_logs`:

```sql
SELECT * FROM whatsapp_connection_logs 
WHERE tenant_id = 'seu-tenant-id'
ORDER BY created_at DESC 
LIMIT 10;
```

### No Site
- Menu WhatsApp → Integração WhatsApp → Aba "Conexão"
- Ou no botão flutuante → "Últimos Eventos"

## 🔐 Segurança

### Para Produção:

1. **Use HTTPS**: Configure SSL/TLS no servidor
2. **Firewall**: Libere apenas porta 3333 para IPs confiáveis
3. **Variáveis de Ambiente**: Nunca exponha `SUPABASE_SERVICE_KEY`
4. **PM2**: Use PM2 para manter servidor sempre ativo

```bash
# Instalar PM2
npm install -g pm2

# Iniciar com PM2
pm2 start server-whatsapp-multitenant.js --name whatsapp-server

# Ver logs
pm2 logs whatsapp-server

# Reiniciar
pm2 restart whatsapp-server
```

## 🌍 Servidor Remoto

Se o servidor está em outra máquina:

### 1. Configure o IP/Domínio

```sql
UPDATE integration_whatsapp 
SET api_url = 'http://192.168.1.100:3333'  -- ou seu domínio
WHERE tenant_id = 'seu-tenant-id';
```

### 2. Libere a Porta no Firewall

**Linux (UFW):**
```bash
sudo ufw allow 3333
```

**Windows:**
- Painel de Controle → Firewall → Regras de Entrada → Nova Regra
- Porta TCP 3333

### 3. Configure CORS (se necessário)

No arquivo `server-whatsapp-multitenant.js`, certifique-se que CORS permite sua origem:

```javascript
app.use(cors({
  origin: '*', // ou domínio específico
  credentials: true
}));
```

## 📱 Múltiplos Tenants

O servidor multi-tenant suporta várias empresas simultaneamente. Cada uma tem:

- **Sessão isolada**: Armazenada em `.wwebjs_auth_tenants/tenant-{id}`
- **QR Code único**: Cada empresa escaneia seu próprio QR
- **Conexão independente**: Uma empresa conectar não afeta outras

## ✨ Recursos Automáticos

Quando o servidor está rodando, as seguintes funcionalidades automáticas ficam disponíveis:

- ✅ Mensagem quando item é adicionado ao pedido
- ✅ Mensagem quando pedido é pago
- ✅ Mensagem quando produto é cancelado
- ✅ Envio de mensagens em massa
- ✅ Labels automáticas (APP)
- ✅ Logs de todas as ações

## 🆘 Suporte

Se continuar com problemas:

1. Verifique os logs do servidor Node.js
2. Verifique a tabela `whatsapp_connection_logs`
3. Teste a conexão manualmente: `curl http://localhost:3333/health`
4. Revise os documentos: `SERVIDOR_V3_README.md` e `GUIA_SERVIDOR_OTIMIZADO.md`

---

**Dica**: Mantenha o servidor sempre rodando para que as mensagens automáticas funcionem 24/7!

# Como Configurar WhatsApp para Cada Empresa

## ⚠️ IMPORTANTE: Sistema Individual por Empresa

Cada empresa no sistema **DEVE** ter seu próprio servidor WhatsApp rodando. Não é possível compartilhar um único servidor entre várias empresas.

## 📋 Passos para Configuração

### 1️⃣ Preparar o Servidor Node.js

Cada empresa precisa de:
- Um servidor Node.js rodando o arquivo `server-whatsapp-individual.js`
- Uma porta exclusiva (ex: Empresa A usa 3333, Empresa B usa 3334, etc.)
- Um arquivo `.env` próprio com suas credenciais

### 2️⃣ Criar o Arquivo .env da Empresa

Crie um arquivo `.env` para cada empresa com o seguinte conteúdo:

```env
# Identificação da Empresa
TENANT_ID=uuid-da-empresa-aqui
TENANT_SLUG=slug-da-empresa

# Porta do Servidor (cada empresa usa uma porta diferente)
PORT=3333

# Supabase (mesmas credenciais para todas)
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
```

**Exemplo para múltiplas empresas:**

**Empresa 1 (.env.empresa1):**
```env
TENANT_ID=550e8400-e29b-41d4-a716-446655440001
TENANT_SLUG=empresa1
PORT=3333
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-key
```

**Empresa 2 (.env.empresa2):**
```env
TENANT_ID=550e8400-e29b-41d4-a716-446655440002
TENANT_SLUG=empresa2
PORT=3334
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-key
```

### 3️⃣ Rodar o Servidor para Cada Empresa

**Para a primeira empresa (usando .env padrão):**
```bash
node server-whatsapp-individual.js
```

**Para outras empresas (especificando o .env):**
```bash
# Terminal 1 - Empresa 1
NODE_ENV=empresa1 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa1

# Terminal 2 - Empresa 2
NODE_ENV=empresa2 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa2

# Terminal 3 - Empresa 3
NODE_ENV=empresa3 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa3
```

### 4️⃣ Escanear QR Code

1. Quando o servidor iniciar, um QR Code será exibido no terminal
2. Abra o WhatsApp no celular da empresa
3. Vá em **Configurações > Aparelhos Conectados > Conectar um Aparelho**
4. Escaneie o QR Code exibido no terminal
5. Aguarde a mensagem "✅ Cliente conectado e pronto!"

### 5️⃣ Configurar no Sistema Web

1. Acesse o sistema web
2. Faça login como a empresa
3. Vá em **Integrações > WhatsApp**
4. Preencha os campos:
   - **API URL**: `http://localhost:3333` (ou a porta que você configurou)
   - **Nome da Instância**: Nome identificador (ex: "empresa-fulano")
   - **Webhook Secret**: (opcional)
5. Ative o switch **WhatsApp**
6. Clique em **Salvar WhatsApp**

### 6️⃣ Configurar Template de Confirmação de Pagamento

1. Vá em **WhatsApp > Templates** no sistema
2. Crie ou edite o template **PAID_ORDER**
3. Use as variáveis disponíveis:
   - `{customer_name}` - Nome do cliente
   - `{order_id}` - Número do pedido
   - `{total_amount}` - Valor total (formatado)
   - `{created_at}` - Data de criação

**Exemplo de template:**
```
Olá {customer_name}! 🎉

Confirmamos o pagamento do seu pedido #{order_id} no valor de {total_amount}!

Seu pedido já está sendo preparado e em breve você receberá informações sobre a entrega.

Obrigado pela preferência! ❤️
```

## 🔍 Como Verificar se Está Funcionando

### Teste de Conexão

Acesse no navegador:
```
http://localhost:3333/status
```

Deve retornar algo como:
```json
{
  "status": "running",
  "authenticated": true,
  "tenant_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

### Teste de Envio de Confirmação de Pagamento

1. Vá em **Pedidos** no sistema web
2. Localize um pedido não pago
3. Clique no botão de **Pago** (switch)
4. O sistema deve:
   - Marcar o pedido como pago
   - Enviar automaticamente a mensagem via WhatsApp usando o template configurado
   - Mostrar "✅ Confirmação Enviada"

## ❌ Resolução de Problemas

### Erro: "Configure a URL do servidor WhatsApp"

**Causa**: A URL do servidor não foi configurada no sistema web

**Solução**:
1. Vá em **Integrações > WhatsApp**
2. Configure a **API URL** (ex: `http://localhost:3333`)
3. Salve as configurações

### Erro: "Connection refused" ou "ECONNREFUSED"

**Causa**: O servidor Node.js não está rodando ou está em uma porta diferente

**Solução**:
1. Verifique se o servidor está rodando: `ps aux | grep node`
2. Verifique a porta no `.env` e certifique-se que está usando a mesma no sistema web
3. Reinicie o servidor: `node server-whatsapp-individual.js`

### Mensagem não é enviada

**Causas possíveis**:
1. WhatsApp não está conectado (escaneie o QR Code novamente)
2. Template PAID_ORDER não está configurado no banco de dados
3. Número de telefone do cliente está incorreto

**Solução**:
1. Verifique o status: `http://localhost:3333/status`
2. Veja os logs do servidor Node.js no terminal
3. Verifique se o template PAID_ORDER existe em **WhatsApp > Templates**

### Porta já em uso

**Erro**: `EADDRINUSE: address already in use :::3333`

**Solução**:
1. Use uma porta diferente no arquivo `.env`
2. Ou mate o processo na porta: `lsof -ti:3333 | xargs kill -9`

## 📊 Gerenciamento de Múltiplas Empresas

### Estrutura Recomendada de Arquivos

```
projeto/
├── server-whatsapp-individual.js
├── .env.empresa1          # Porta 3333
├── .env.empresa2          # Porta 3334
├── .env.empresa3          # Porta 3335
├── .wwebjs_auth/
│   ├── session-empresa1/
│   ├── session-empresa2/
│   └── session-empresa3/
└── package.json
```

### Script para Rodar Todas as Empresas

Crie um arquivo `start-all-companies.sh`:

```bash
#!/bin/bash

# Empresa 1
NODE_ENV=empresa1 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa1 &

# Empresa 2
NODE_ENV=empresa2 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa2 &

# Empresa 3
NODE_ENV=empresa3 node -r dotenv/config server-whatsapp-individual.js dotenv_config_path=.env.empresa3 &

echo "Todos os servidores foram iniciados!"
echo "Para ver os logs, use: tail -f logs/*.log"
```

Torne executável:
```bash
chmod +x start-all-companies.sh
./start-all-companies.sh
```

## 🔒 Segurança

1. **Nunca compartilhe** arquivos `.env` entre empresas
2. **Não exponha** os servidores Node.js diretamente na internet
3. Use **HTTPS** em produção (com certificado SSL/TLS)
4. Configure **firewall** para permitir apenas IPs autorizados
5. Mantenha as **portas internas** protegidas

## 📞 Suporte

Se após seguir todos os passos você ainda tiver problemas:

1. Verifique os logs do servidor Node.js
2. Verifique os logs do navegador (F12 > Console)
3. Teste a URL manualmente: `http://localhost:3333/status`
4. Verifique se o TENANT_ID está correto no `.env`

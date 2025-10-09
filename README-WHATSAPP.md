# 📱 Servidor WhatsApp Simplificado

Sistema moderno e eficiente de integração WhatsApp multi-tenant.

## 🚀 Inicialização Rápida

### 1. Instalar Dependências

**Windows:**
```bash
instalar-dependencias-whatsapp.bat
```

**Linux/Mac:**
```bash
npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0
```

### 2. Iniciar o Servidor

**Windows**
```bash
start-whatsapp.bat
```

**Linux/Mac**
```bash
chmod +x start-whatsapp.sh
./start-whatsapp.sh
```

## 📋 Requisitos

- Node.js 18+
- Supabase configurado
- Variável de ambiente: `SUPABASE_SERVICE_KEY`

## 🔧 Configuração

1. **Configure a variável de ambiente:**
```bash
export SUPABASE_SERVICE_KEY=sua_chave_aqui
```

2. **No Supabase, configure a integração:**
   - Tabela: `integration_whatsapp`
   - Campo `api_url`: `http://localhost:3333` (ou seu servidor)
   - Campo `is_active`: `true`

3. **Inicie o servidor e escaneie o QR Code no terminal**

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Status Geral
```
GET /status
```
Retorna status de todos os tenants conectados.

### Status de Tenant Específico
```
GET /status/:tenantId
```

### Inicializar Cliente
```
POST /init/:tenantId
Body: { "tenantName": "Nome do Tenant" }
```

### Enviar Mensagem Individual
```
POST /send
Body: {
  "tenantId": "uuid",
  "phone": "31999999999",
  "message": "Olá!"
}
```

### Enviar Mensagem em Massa
```
POST /broadcast
Body: {
  "tenantId": "uuid",
  "phones": ["31999999999", "31888888888"],
  "message": "Olá a todos!",
  "delay": 2000
}
```

## 🤖 Funcionalidades Automáticas

### Detecção de Código de Produtos
O sistema detecta automaticamente códigos de produtos nas mensagens:
- Formato aceito: `C123`, `P123`, `A123` ou apenas `123`
- Adiciona automaticamente ao carrinho do cliente
- Envia mensagem de confirmação

### Mensagens Automáticas
- ✅ Confirmação de produto adicionado
- 📦 Notificação de pedido criado
- ❌ Aviso de produto cancelado

## 🗂️ Estrutura de Dados

O sistema utiliza as seguintes tabelas do Supabase:
- `tenants`: Empresas/tenants
- `integration_whatsapp`: Configuração de integração
- `whatsapp_messages`: Histórico de mensagens
- `whatsapp_templates`: Templates de mensagens
- `products`: Produtos
- `customers`: Clientes
- `carts`: Carrinhos
- `cart_items`: Itens do carrinho

## 🔐 Segurança

- Cada tenant tem seu próprio cliente WhatsApp isolado
- Dados de sessão armazenados localmente em `.wwebjs_auth_tenants/`
- Comunicação com Supabase via Service Role Key

## 🐛 Troubleshooting

### ❌ Erro: "Could not find Chromium"

Se aparecer erro sobre Chromium não encontrado:

1. **Execute o instalador de dependências:**
   ```bash
   instalar-dependencias-whatsapp.bat  # Windows
   npm install puppeteer@latest        # Linux/Mac
   ```

2. **O servidor tentará automaticamente usar o Chrome instalado no seu sistema**

3. **Se persistir, instale o Google Chrome:**
   - Windows: https://www.google.com/chrome/
   - Linux: `sudo apt install google-chrome-stable`

### QR Code não aparece
- Verifique se o servidor está rodando
- Certifique-se de que não há outro servidor na porta 3333

### Mensagens não enviam
- Verifique o status em `http://localhost:3333/status/:tenantId`
- Confirme que o status é `ready`
- Verifique os logs do servidor

### Cliente desconecta
- WhatsApp Web pode desconectar após inatividade
- Reconecte escaneando o QR Code novamente

## 📝 Logs

O servidor exibe logs coloridos para facilitar debugging:
- 🚀 Inicialização
- 📱 QR Code
- ✅ Sucesso
- ❌ Erro
- 📨 Mensagens recebidas
- 🛒 Produtos detectados

## 🔄 Atualizações

Para atualizar o sistema:
```bash
git pull
npm install
```

Reinicie o servidor.

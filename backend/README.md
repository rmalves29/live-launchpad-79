# 📱 OrderZap Backend API

Backend do sistema OrderZap com integração WhatsApp via Baileys.

## 🚀 Tecnologias

- **Node.js 18+** - Runtime JavaScript
- **Express** - Framework web
- **Baileys** - Integração WhatsApp (sem API oficial)
- **Supabase** - Banco de dados PostgreSQL
- **QRCode** - Geração de QR Code para autenticação

## 📁 Estrutura

```
backend/
├── src/
│   ├── config/          # Configurações (logger, supabase)
│   ├── controllers/     # Controladores de rotas
│   ├── routes/          # Definição de rotas
│   ├── services/        # Lógica de negócio (WhatsApp, etc)
│   └── server.js        # Servidor Express
├── whatsapp-sessions/   # Sessões do WhatsApp (não comitar!)
├── Dockerfile           # Build para Railway
├── package.json
└── .env.example
```

## 🔧 Instalação Local

```bash
cd backend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# Iniciar em desenvolvimento
npm run dev

# Iniciar em produção
npm start
```

## 🌐 API Endpoints

### Health Check
```http
GET /health
```

### WhatsApp

**Iniciar conexão**
```http
POST /api/whatsapp/start
Content-Type: application/json

{
  "tenantId": "minha-loja"
}
```

**Obter QR Code**
```http
GET /api/whatsapp/qrcode/:tenantId
```

**Verificar status**
```http
GET /api/whatsapp/status/:tenantId
```

**Desconectar**
```http
POST /api/whatsapp/disconnect
Content-Type: application/json

{
  "tenantId": "minha-loja"
}
```

**Enviar mensagem**
```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
  "tenantId": "minha-loja",
  "to": "5511999999999",
  "message": "Olá! Seu pedido está pronto."
}
```

**Enviar mídia**
```http
POST /api/whatsapp/send-media
Content-Type: application/json

{
  "tenantId": "minha-loja",
  "to": "5511999999999",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Confira seu pedido!",
  "mediaType": "image"
}
```

**Listar sessões ativas**
```http
GET /api/whatsapp/sessions
```

### Pedidos (Orders)

**Listar pedidos**
```http
GET /api/orders/:tenantId?limit=50&offset=0
```

**Criar pedido**
```http
POST /api/orders
Content-Type: application/json

{
  "tenant_id": "uuid-do-tenant",
  "customer_id": "uuid-do-cliente",
  "items": [...],
  "total": 150.00
}
```

**Atualizar pedido**
```http
PATCH /api/orders/:orderId
Content-Type: application/json

{
  "status": "completed"
}
```

## 🐳 Deploy no Railway

1. **Criar novo serviço no Railway**
   - Conecte ao GitHub
   - Selecione o repositório
   - **Root Directory:** `backend`
   - **Builder:** Dockerfile

2. **Configurar variáveis de ambiente:**
   ```
   PORT=3001
   NODE_ENV=production
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key
   FRONTEND_URL=https://seu-frontend.railway.app
   WHATSAPP_SESSIONS_PATH=/app/whatsapp-sessions
   LOG_LEVEL=info
   ```

3. **Deploy**
   - Railway detectará o Dockerfile automaticamente
   - Build levará ~3-5 minutos
   - Após deploy, acesse: `https://seu-backend.railway.app/health`

## 📝 Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `PORT` | Porta do servidor | `3001` |
| `NODE_ENV` | Ambiente | `production` |
| `SUPABASE_URL` | URL do Supabase | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key | `eyJhbGci...` |
| `FRONTEND_URL` | URL do frontend (CORS) | `https://app.com` |
| `WHATSAPP_SESSIONS_PATH` | Caminho das sessões | `./whatsapp-sessions` |
| `LOG_LEVEL` | Nível de log | `info` |

## 🔐 Segurança

- ✅ CORS configurado para aceitar apenas o frontend
- ✅ Sessões do WhatsApp isoladas por tenant
- ✅ Logs estruturados com Pino
- ✅ Usuário não-root no Docker
- ✅ Health checks configurados

## 📱 Como Funciona o WhatsApp?

1. **Cliente chama** `POST /api/whatsapp/start` com `tenantId`
2. **Backend gera QR Code** e retorna em base64
3. **Cliente escaneia** QR Code no WhatsApp
4. **Backend salva sessão** em `whatsapp-sessions/`
5. **Cliente pode enviar mensagens** via API

## 🐛 Troubleshooting

**Erro: "Sessão não encontrada"**
- Conecte o WhatsApp primeiro: `POST /api/whatsapp/start`

**Erro: "Cannot find module"**
- Verifique se todas as dependências foram instaladas: `npm install`

**QR Code não aparece**
- Verifique logs: `docker logs <container-id>`
- Certifique-se de que o diretório `whatsapp-sessions/` existe

**Mensagens não são enviadas**
- Verifique se a sessão está conectada: `GET /api/whatsapp/status/:tenantId`
- Formato do número: `5511999999999` (sem + ou espaços)

## 📚 Recursos

- [Documentação Baileys](https://github.com/WhiskeySockets/Baileys)
- [Express.js Docs](https://expressjs.com/)
- [Supabase Docs](https://supabase.com/docs)

---

**Versão:** 2.0.0  
**Autor:** OrderZap Team  
**Licença:** MIT

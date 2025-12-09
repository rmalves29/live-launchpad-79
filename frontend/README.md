# 🎨 OrderZap Frontend

Interface web do sistema OrderZap construída com Next.js 14 (App Router).

## 🚀 Tecnologias

- **Next.js 14** - Framework React com App Router
- **React 18** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização utilitária
- **Supabase** - Autenticação e banco de dados

## 📁 Estrutura

```
frontend/
├── app/
│   ├── api/            # API Routes do Next.js
│   ├── auth/           # Páginas de autenticação
│   ├── tenant/         # Área multi-tenant
│   ├── admin/          # Área administrativa
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── api.ts          # Cliente HTTP para Backend API
│   └── utils/
├── public/
├── Dockerfile
├── next.config.js
└── package.json
```

## 🔧 Instalação Local

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais

# Iniciar em desenvolvimento
npm run dev

# Build para produção
npm run build
npm start
```

## 🌐 Variáveis de Ambiente

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key-aqui

# Environment
NODE_ENV=development
```

## 📡 Comunicação com Backend

O frontend se comunica com o backend via **REST API** usando o cliente `lib/api.ts`:

```typescript
import apiClient from '@/lib/api';

// Conectar WhatsApp
const result = await apiClient.startWhatsApp('minha-loja');

// Obter QR Code
const qr = await apiClient.getWhatsAppQRCode('minha-loja');

// Enviar mensagem
await apiClient.sendWhatsAppMessage(
  'minha-loja',
  '5511999999999',
  'Olá!'
);

// Listar pedidos
const orders = await apiClient.getOrders('tenant-id');
```

## 🐳 Deploy no Railway

1. **Criar novo serviço no Railway**
   - Conecte ao GitHub
   - Selecione o repositório
   - **Root Directory:** `frontend`
   - **Builder:** Dockerfile

2. **Configurar variáveis de ambiente:**
   ```
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://seu-backend.railway.app
   NEXT_PUBLIC_APP_URL=https://seu-frontend.railway.app
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key
   ```

3. **Deploy**
   - Railway detectará o Dockerfile automaticamente
   - Build levará ~3-5 minutos
   - Após deploy, acesse: `https://seu-frontend.railway.app`

## 🔗 Integração Backend + Frontend

### Fluxo de Conexão WhatsApp:

1. **Frontend:** Usuário clica em "Conectar WhatsApp"
2. **Frontend → Backend:** `POST /api/whatsapp/start`
3. **Backend:** Gera QR Code e retorna
4. **Frontend:** Exibe QR Code para usuário escanear
5. **Frontend:** Polling em `GET /api/whatsapp/status/:tenantId`
6. **Backend:** Retorna `connected: true` quando autenticado
7. **Frontend:** Atualiza UI para "Conectado"

### Fluxo de Envio de Mensagem:

1. **Frontend:** Usuário digita mensagem e clica "Enviar"
2. **Frontend → Backend:** `POST /api/whatsapp/send-message`
3. **Backend:** Envia via Baileys
4. **Backend → Frontend:** Retorna status
5. **Frontend:** Exibe confirmação

## 🎨 Páginas Principais

- `/` - Landing page
- `/auth/login` - Login
- `/auth/register` - Registro
- `/tenant/[slug]` - Dashboard do tenant
- `/tenant/[slug]/orders` - Gestão de pedidos
- `/tenant/[slug]/whatsapp` - Configuração WhatsApp
- `/admin` - Administração global

## 🔐 Autenticação

Autenticação via Supabase Auth:

```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

// Login
await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'senha123'
});

// Logout
await supabase.auth.signOut();
```

## 📱 Responsividade

- ✅ Mobile-first design
- ✅ Tailwind CSS breakpoints
- ✅ Layout adaptativo

## 🐛 Troubleshooting

**Erro: "Network request failed"**
- Verifique se o backend está rodando
- Verifique `NEXT_PUBLIC_API_URL` no `.env.local`

**Erro: "CORS blocked"**
- Configure `FRONTEND_URL` no backend corretamente

**Build falha**
- Execute `npm run build` localmente para ver erros
- Verifique se todas as dependências estão no `package.json`

---

**Versão:** 2.0.0  
**Autor:** OrderZap Team  
**Licença:** MIT

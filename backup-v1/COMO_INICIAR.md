# 🚀 Como Iniciar o Sistema

## ⚠️ ATENÇÃO: SIGA OS PASSOS NA ORDEM!

## 📋 Pré-requisitos

- Node.js 16+ instalado
- Conta Supabase configurada

## ⚙️ Configuração Inicial (Primeira vez)

### 1️⃣ Instalar Dependências (OBRIGATÓRIO!)

**ANTES DE FAZER QUALQUER COISA**, rode este comando na raiz do projeto:

```bash
npm install
```

Aguarde até que todos os pacotes sejam baixados e instalados. Isso pode levar alguns minutos.

✅ Quando terminar, você verá uma mensagem indicando que a instalação foi concluída.

### 2️⃣ Configurar Variáveis de Ambiente

Edite o arquivo `.env` na raiz do projeto:

```env
# Frontend (React/Vite)
VITE_SUPABASE_PROJECT_ID="hxtbsieodbtzgcvvkeqx"
VITE_SUPABASE_PUBLISHABLE_KEY="sua_publishable_key"
VITE_SUPABASE_URL="https://hxtbsieodbtzgcvvkeqx.supabase.co"

# Backend (Node.js WhatsApp Server)
SUPABASE_URL="https://hxtbsieodbtzgcvvkeqx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key_AQUI"

# Porta do servidor
PORT=3333
```

**⚠️ IMPORTANTE:** Obtenha a chave `service_role` em:
https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/settings/api

## 🎯 Iniciar o Sistema

### 1️⃣ Iniciar Servidor WhatsApp (Backend)

```bash
node server1.js
```

Ou se preferir usar nodemon:

```bash
npx nodemon server1.js
```

O servidor iniciará em: `http://localhost:3333`

### 2️⃣ Iniciar Frontend (React)

Em outro terminal:

```bash
npm run dev
```

O frontend iniciará em: `http://localhost:5173`

## 📱 Como Conectar WhatsApp

1. Acesse: `http://localhost:3333/qr/{seu_tenant_id}`
2. Escaneie o QR Code com seu WhatsApp
3. Aguarde a mensagem "✅ WhatsApp conectado!"

## 🔍 Verificar Status

### Status do WhatsApp:
```bash
curl http://localhost:3333/status/{tenant_id}
```

### Testar Envio:
```bash
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "seu_tenant_id",
    "phone": "5531999999999",
    "message": "Teste"
  }'
```

### Listar Grupos:
```bash
curl http://localhost:3333/groups/{tenant_id}
```

## 📊 Monitor de Carrinho

O sistema monitora automaticamente novos itens adicionados ao carrinho a cada 3 segundos e envia mensagens WhatsApp automaticamente.

## 🛠️ Troubleshooting

### Erro: MODULE_NOT_FOUND (módulo não encontrado)
**Causa:** As dependências não foram instaladas.

**Solução:**
```bash
npm install
```

Aguarde a conclusão da instalação e tente novamente.

### Erro: SUPABASE_SERVICE_ROLE_KEY não configurada
- Verifique se o arquivo `.env` existe na raiz
- Verifique se a chave está correta (copie novamente do Supabase)
- Reinicie o servidor após editar o `.env`

### QR Code não aparece
- Verifique se a porta 3333 está livre: `netstat -ano | findstr :3333`
- Limpe a sessão antiga: delete a pasta `.baileys_auth`
- Reinicie o servidor

### WhatsApp desconecta sozinho
- Verifique sua conexão com internet
- Mantenha o WhatsApp do celular conectado
- Não use o WhatsApp Web simultaneamente

### Mensagens não são enviadas
- Verifique os logs do servidor
- Teste manualmente com curl
- Verifique se o tenant_id está correto
- Confira se o número está no formato: 5531999999999

## 📚 Documentação Adicional

- `LOCALHOST_MODO.md` - Como funciona o modo localhost
- `TROUBLESHOOTING_WHATSAPP.md` - Solução de problemas detalhada

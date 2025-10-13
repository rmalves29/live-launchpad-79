# 🚀 Instalação do Servidor WhatsApp

## Pré-requisitos

- Node.js 16 ou superior instalado
- Chrome ou Chromium instalado no Windows

## Passo a passo

### 1. Instalar dependências

No terminal, execute na pasta do projeto:

```bash
npm install --prefix . whatsapp-web.js express cors qrcode-terminal node-fetch@2
```

**OU** se preferir usar o arquivo package.json específico:

```bash
cp server-package.json package-server.json
npm install --prefix . --package-lock-only=false
```

### 2. Configurar variável de ambiente

Crie um arquivo `.env` na raiz do projeto ou defina a variável:

```bash
# Windows (PowerShell)
$env:SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA"

# Windows (CMD)
set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA
```

### 3. Iniciar o servidor

```bash
node server1.js
```

### 4. Escanear QR Code

Quando o servidor iniciar, um QR Code aparecerá no terminal. Escaneie com o WhatsApp.

## Verificar Status

Após conectar, verifique o status:

```bash
curl http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

## Troubleshooting

### Erro: "Client is not defined"
**Solução:** Instale as dependências (passo 1)

### Erro: "Chrome not found"
**Solução:** Certifique-se que o Google Chrome está instalado em uma das pastas padrão

### WhatsApp desconecta
**Solução:** O servidor precisa ficar rodando continuamente. Use um gerenciador de processo como PM2 para produção.

## Produção

Para rodar em produção, considere:

1. **PM2** para manter o processo rodando:
```bash
npm install -g pm2
pm2 start server1.js --name whatsapp-server
pm2 save
pm2 startup
```

2. **Railway/Heroku**: Configure a variável `WHATSAPP_MULTITENANT_URL` no Supabase apontando para a URL pública do servidor.

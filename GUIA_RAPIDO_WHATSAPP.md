# 🚀 Guia Rápido: Configurar WhatsApp (Para Iniciantes)

## 📌 O Que Você Precisa Entender

O sistema tem **2 partes**:

1. **Site (React)** - Já está funcionando no Lovable ✅
2. **Servidor Node.js** - Precisa rodar para o WhatsApp funcionar ❌

O servidor Node.js é responsável por:
- Gerenciar a conexão com o WhatsApp
- Gerar o QR Code
- Enviar e receber mensagens
- Manter a sessão ativa

## 🎯 Opção 1: Rodar Localmente (Recomendado para Começar)

Rodar no seu próprio computador é mais fácil para testar.

### Passo 1: Instalar Node.js

1. Acesse: https://nodejs.org/
2. Baixe a versão **LTS** (recomendada)
3. Instale normalmente (Next, Next, Finish)
4. Teste no terminal/prompt:
```bash
node --version
# Deve mostrar algo como: v20.11.0
```

### Passo 2: Preparar os Arquivos do Servidor

Você já tem os arquivos no projeto! Eles estão na raiz:
- `server-whatsapp-v3.js`
- `server-whatsapp-multitenant.js`
- `start-multitenant.sh` (Linux/Mac)
- `start-windows.bat` (Windows)

**Para usar, você precisa baixar esses arquivos do Lovable:**

1. No Lovable, clique em "Dev Mode" (canto superior)
2. Encontre os arquivos mencionados acima
3. Copie o conteúdo de cada um
4. Cole em arquivos locais no seu computador

### Passo 3: Instalar Dependências

Abra o terminal/prompt na pasta onde salvou os arquivos e execute:

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch@2
```

Aguarde a instalação (pode demorar 2-5 minutos).

### Passo 4: Configurar Variáveis de Ambiente

Crie um arquivo chamado `.env` na mesma pasta:

```env
PORT=3333
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=sua_service_key_aqui
```

**Onde encontrar a SERVICE_KEY:**
1. Vá no Supabase: https://supabase.com/dashboard
2. Seu projeto → Settings → API
3. Copie a chave "service_role" (não a anon!)

### Passo 5: Iniciar o Servidor

**Windows:**
```bash
node server-whatsapp-v3.js
```

**Linux/Mac:**
```bash
node server-whatsapp-v3.js
```

Você deve ver algo assim:
```
🚀 Servidor WhatsApp rodando na porta 3333
📊 Status: http://localhost:3333/status
```

### Passo 6: Configurar no Banco de Dados

Agora precisa dizer ao sistema onde o servidor está rodando.

No Supabase (SQL Editor), execute:

```sql
-- Substitua 'seu-tenant-id' pelo ID da sua empresa
-- Para descobrir o ID, execute: SELECT id, name FROM tenants;

INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active
) VALUES (
  'seu-tenant-id',
  'MINHA_EMPRESA',
  'http://localhost:3333',
  'secret123',
  true
)
ON CONFLICT (tenant_id) DO UPDATE 
SET api_url = 'http://localhost:3333', 
    is_active = true;
```

### Passo 7: Conectar no Site

1. Volte para o site
2. Clique no botão "WhatsApp" (canto inferior direito)
3. Clique em "Conectar WhatsApp"
4. Escaneie o QR Code com seu celular
5. Pronto! ✅

---

## 🌐 Opção 2: Rodar em Servidor (Para Produção)

Se você quer que funcione 24/7, precisa colocar em um servidor.

### Opções de Servidor:

#### A) VPS (Servidor Virtual)
- **Recomendados**: Digital Ocean, Vultr, Linode, AWS Lightsail
- **Custo**: ~$5-10/mês
- **Vantagens**: Total controle, sempre online
- **Desvantagens**: Precisa configurar tudo

#### B) Serviço Gerenciado
- **Recomendados**: Heroku, Railway, Render
- **Custo**: Gratuito até ~$7/mês
- **Vantagens**: Fácil deploy, tudo automatizado
- **Desvantagens**: Menos controle

### Como Fazer (Railway - Mais Fácil):

1. **Criar conta no Railway**: https://railway.app

2. **Criar novo projeto**:
   - New Project → Deploy from GitHub repo
   - Ou: Empty Project → Add a service

3. **Fazer upload dos arquivos**:
   - Conectar seu repositório GitHub
   - Ou usar Railway CLI

4. **Configurar variáveis**:
   - No Railway, vá em Variables
   - Adicione:
     - `PORT` = 3333
     - `SUPABASE_URL` = https://hxtbsieodbtzgcvvkeqx.supabase.co
     - `SUPABASE_SERVICE_KEY` = sua_chave

5. **Deploy automático**:
   - Railway vai gerar uma URL tipo: `https://seu-app.up.railway.app`

6. **Atualizar banco de dados**:
```sql
UPDATE integration_whatsapp 
SET api_url = 'https://seu-app.up.railway.app'
WHERE tenant_id = 'seu-tenant-id';
```

---

## 🔍 Como Saber o Tenant ID?

Execute no Supabase SQL Editor:

```sql
SELECT id, name, slug 
FROM tenants 
WHERE is_active = true;
```

Copie o `id` da sua empresa.

---

## 🐛 Problemas Comuns

### "Servidor WhatsApp não está rodando"

**Causa**: O Node.js não está executando.

**Solução**: 
1. Abra terminal/prompt
2. Navegue até a pasta do projeto
3. Execute: `node server-whatsapp-v3.js`
4. Deixe o terminal aberto

### "Não consigo executar no terminal"

**Windows**: 
- Pressione `Win + R`
- Digite `cmd` e Enter
- Use `cd` para navegar: `cd C:\caminho\do\projeto`

**Mac/Linux**:
- Abra Terminal
- Use `cd` para navegar: `cd /caminho/do/projeto`

### "npm não é reconhecido"

**Solução**: Node.js não foi instalado corretamente.
- Desinstale e reinstale: https://nodejs.org/
- Reinicie o computador
- Teste novamente: `node --version`

### "Porta 3333 já está em uso"

**Solução**: 
- Mude para outra porta no `.env`: `PORT=3334`
- Ou mate o processo na porta 3333

**Windows**:
```bash
netstat -ano | findstr :3333
taskkill /PID numero_do_pid /F
```

**Linux/Mac**:
```bash
lsof -i :3333
kill -9 PID
```

---

## 📱 Múltiplas Empresas (Multi-Tenant)

Se você tem várias empresas, use `server-whatsapp-multitenant.js`:

1. **Cada empresa precisa de um registro**:
```sql
-- Empresa 1
INSERT INTO integration_whatsapp (tenant_id, instance_name, api_url, webhook_secret, is_active)
VALUES ('tenant-1-id', 'EMPRESA_1', 'http://localhost:3333', 'secret1', true);

-- Empresa 2
INSERT INTO integration_whatsapp (tenant_id, instance_name, api_url, webhook_secret, is_active)
VALUES ('tenant-2-id', 'EMPRESA_2', 'http://localhost:3333', 'secret2', true);
```

2. **Um único servidor gerencia todas**:
```bash
node server-whatsapp-multitenant.js
```

3. **Cada empresa terá seu próprio QR Code e sessão independente**.

---

## ✅ Checklist de Configuração

- [ ] Node.js instalado (v16+)
- [ ] Arquivos do servidor baixados
- [ ] Dependências instaladas (`npm install`)
- [ ] Arquivo `.env` criado com credenciais
- [ ] Servidor Node.js rodando
- [ ] Registro em `integration_whatsapp` criado
- [ ] `api_url` configurada corretamente
- [ ] Site testado e QR Code aparecendo

---

## 🎥 Resumo Visual

```
┌─────────────────┐
│   Seu Site      │  ← Usuário acessa aqui
│   (Lovable)     │
└────────┬────────┘
         │
         │ Chama API
         ▼
┌─────────────────┐
│ Servidor Node   │  ← Você precisa rodar isso!
│ (Local ou VPS)  │
└────────┬────────┘
         │
         │ Conecta com
         ▼
┌─────────────────┐
│   WhatsApp      │  ← Onde as mensagens são enviadas
│  Web (Browser)  │
└─────────────────┘
```

---

## 💡 Dica de Ouro

**Para desenvolvimento/testes**: Rode localmente (`localhost:3333`)

**Para produção/uso real**: Coloque em servidor (Railway, Digital Ocean, etc.)

**Não quer pagar servidor?** 
- Use o computador local 24/7 (se tiver energia estável)
- Ou use plano gratuito do Railway/Render (limitado mas funciona)

---

## 📞 Precisa de Ajuda?

1. Verifique os logs no terminal onde o servidor está rodando
2. Consulte `COMO_INICIAR_SERVIDOR_WHATSAPP.md` para mais detalhes
3. Revise `SERVIDOR_V3_README.md` para documentação completa

**Lembre-se**: O servidor precisa estar rodando SEMPRE que você quiser usar o WhatsApp no site!

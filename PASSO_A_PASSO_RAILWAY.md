# 🚀 Passo a Passo COMPLETO - Deploy WhatsApp no Railway

## ⏱️ Tempo estimado: 15-20 minutos

---

## ETAPA 1: Preparar Arquivos (5 minutos)

### 1.1 - Criar arquivo package.json para Railway

1. **Abra o Lovable** (onde você está agora)
2. **Clique em "Dev Mode"** (canto superior esquerdo)
3. **Clique no botão "+"** ao lado de "Files"
4. **Digite o nome**: `package-servidor-railway.json`
5. **Cole este conteúdo**:

```json
{
  "name": "orderzaps-whatsapp-server",
  "version": "1.0.0",
  "description": "Servidor WhatsApp para OrderZaps",
  "main": "server-whatsapp-individual.js",
  "scripts": {
    "start": "node server-whatsapp-individual.js"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.26.0",
    "qrcode-terminal": "^0.12.0",
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "ws": "^8.18.0",
    "dotenv": "^17.2.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

6. **Salve o arquivo** (Ctrl+S ou Cmd+S)

### 1.2 - Verificar se está no GitHub

1. **Olhe no canto superior direito** do Lovable
2. Você deve ver o **ícone do GitHub** 🐙
3. **Se NÃO estiver conectado**:
   - Clique no ícone do GitHub
   - Clique em "Connect to GitHub"
   - Faça login no GitHub
   - Autorize o Lovable
   - Crie um repositório novo

4. **Se já estiver conectado**: ✅ Prossiga!

---

## ETAPA 2: Criar Conta no Railway (3 minutos)

### 2.1 - Acessar Railway

1. **Abra uma nova aba** no navegador
2. **Acesse**: https://railway.app
3. **Clique em "Login"** (canto superior direito)

### 2.2 - Login com GitHub

1. **Clique em "Login with GitHub"**
2. **Autorize o Railway** a acessar sua conta GitHub
3. **Aguarde** o dashboard carregar

### 2.3 - Dashboard Railway

Você verá uma tela com:
- "New Project" (botão roxo grande)
- Seus projetos (vazio se for primeira vez)

✅ **Pronto!** Conta criada.

---

## ETAPA 3: Deploy do Servidor (5 minutos)

### 3.1 - Criar Novo Projeto

1. **Clique em "New Project"** (botão roxo)
2. **Selecione "Deploy from GitHub repo"**
3. **Se aparecer popup de autorização**:
   - Clique em "Configure GitHub App"
   - Selecione seu repositório do Lovable
   - Clique em "Save"
   - Volte ao Railway

### 3.2 - Selecionar Repositório

1. **Na lista**, encontre seu repositório (ex: `seu-usuario/orderzaps`)
2. **Clique nele**
3. **Aguarde** o Railway detectar o projeto (5-10 segundos)

### 3.3 - Configurar Variáveis de Ambiente

1. **Railway vai começar o primeiro deploy** automaticamente
2. **Clique no card do projeto** (vai aparecer um card roxo)
3. **Clique na aba "Variables"** (menu superior)
4. **Clique em "New Variable"**
5. **Adicione CADA variável abaixo** (uma por vez):

**Variável 1:**
```
Nome: TENANT_ID
Valor: 08f2b1b9-3988-489e-8186-c60f0c0b0622
```
Clique em "Add"

**Variável 2:**
```
Nome: PORT
Valor: 3333
```
Clique em "Add"

**Variável 3:**
```
Nome: NODE_ENV
Valor: production
```
Clique em "Add"

**Variável 4:**
```
Nome: ORDERZAPS_PROGRAMDATA
Valor: /app/.orderzaps_data
```
Clique em "Add"

6. **Pronto!** Variáveis configuradas ✅

### 3.4 - Configurar Build e Start Commands

1. **Clique na aba "Settings"** (menu superior)
2. **Role até encontrar "Build Command"**
3. **Clique em "Custom Build Command"**
4. **Cole este comando**:
```bash
cp package-servidor-railway.json package.json && npm install
```
5. **Clique em "Update"**

6. **Role até "Start Command"**
7. **Clique em "Custom Start Command"**
8. **Cole este comando**:
```bash
npm start
```
9. **Clique em "Update"**

### 3.5 - Gerar URL Pública

1. **Ainda em Settings**, role até "Networking"
2. **Clique em "Generate Domain"**
3. **Aguarde 2-3 segundos**
4. **Copie a URL** que apareceu (algo como: `seu-projeto-production.up.railway.app`)
5. **ANOTE ESTA URL** - você vai precisar!

Exemplo de URL:
```
https://orderzaps-whatsapp-production.up.railway.app
```

### 3.6 - Forçar Novo Deploy

1. **Volte para a aba "Deployments"**
2. **Clique em "Deploy"** (botão superior direito)
3. **Aguarde o deploy** (1-2 minutos)
4. **Verifique os logs**:
   - Deve aparecer: `Server running on port 3333`
   - Se aparecer erro, me avise!

---

## ETAPA 4: Atualizar Banco de Dados (2 minutos)

### 4.1 - Acessar Supabase

1. **Abra nova aba**: https://supabase.com/dashboard
2. **Faça login** (se necessário)
3. **Clique no projeto**: `hxtbsieodbtzgcvvkeqx`

### 4.2 - Abrir SQL Editor

1. **No menu lateral esquerdo**, clique em **"SQL Editor"**
2. **Clique em "New Query"**

### 4.3 - Executar SQL

1. **Cole este código** (substitua a URL pela sua URL do Railway):

```sql
-- Atualizar URL do servidor WhatsApp
UPDATE integration_whatsapp 
SET api_url = 'https://SUA-URL-RAILWAY-AQUI.up.railway.app'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

-- Verificar se atualizou
SELECT tenant_id, api_url, is_active 
FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

2. **IMPORTANTE**: Substitua `SUA-URL-RAILWAY-AQUI` pela URL que você copiou no passo 3.5
3. **Exemplo**:
```sql
UPDATE integration_whatsapp 
SET api_url = 'https://orderzaps-whatsapp-production.up.railway.app'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

4. **Clique em "Run"** (ou pressione Ctrl+Enter)
5. **Verifique o resultado**: Deve mostrar a linha atualizada com a nova URL

✅ **Banco atualizado!**

---

## ETAPA 5: Testar Conexão (2 minutos)

### 5.1 - Testar Saúde do Servidor

1. **Abra nova aba** no navegador
2. **Cole sua URL do Railway** + `/health`
3. **Exemplo**:
```
https://orderzaps-whatsapp-production.up.railway.app/health
```
4. **Pressione Enter**
5. **Deve aparecer**: `{"status":"ok"}`

❌ **Se der erro 404 ou timeout**:
- Volte ao Railway
- Veja os logs em "Deployments"
- Me avise qual erro apareceu

### 5.2 - Conectar WhatsApp no Site

1. **Acesse seu site**: https://app.orderzaps.com
2. **Faça login** (se necessário)
3. **No menu lateral**, clique em **"WhatsApp"** → **"Integração WhatsApp"**
4. **Clique em "Conectar WhatsApp"**

**O que deve acontecer:**
- ✅ Botão vai mostrar "Conectando..."
- ✅ Em 3-5 segundos, QR Code aparece
- ✅ Você escaneia com o celular
- ✅ Aparece "WhatsApp conectado!"

❌ **Se der erro**:
- Veja qual mensagem de erro aparece
- Verifique os logs no Railway
- Me avise para eu ajudar

### 5.3 - Escanear QR Code

1. **Abra WhatsApp no celular**
2. **Toque nos 3 pontinhos** (canto superior direito)
3. **Toque em "Aparelhos conectados"**
4. **Toque em "Conectar um aparelho"**
5. **Aponte a câmera** para o QR Code na tela
6. **Aguarde** a confirmação

✅ **Se aparecer "WhatsApp conectado!"** → Funcionou!

---

## ETAPA 6: Verificar Status (1 minuto)

### 6.1 - No Site

1. **Vá para a página inicial** do site
2. **Procure o badge** "WhatsApp" no canto inferior direito
3. **Deve estar VERDE** com "ON"

### 6.2 - No Railway

1. **Volte ao Railway**
2. **Aba "Deployments"** → **Clique no deploy ativo**
3. **Veja os logs**
4. **Deve aparecer**: `WhatsApp ready for tenant: ...`

---

## 🎉 PRONTO! SERVIDOR NO AR!

Seu servidor WhatsApp agora está:
- ✅ Online 24/7
- ✅ Acessível de qualquer lugar
- ✅ Com URL pública
- ✅ Deploy automático via GitHub

---

## 📊 Monitoramento Contínuo

### Ver Logs em Tempo Real

**Railway:**
1. Projetos → Seu projeto
2. Deployments → Deploy ativo
3. View Logs

### Verificar Conexão WhatsApp

**Site:**
- Badge verde no canto inferior direito = Conectado ✅
- Badge vermelho = Desconectado ❌

---

## 🔧 Comandos Úteis

### Testar servidor via terminal

```bash
# Testar saúde
curl https://sua-url-railway.up.railway.app/health

# Testar status de um tenant
curl https://sua-url-railway.up.railway.app/status/08f2b1b9-3988-489e-8186-c60f0c0b0622
```

---

## ⚠️ Troubleshooting

### Erro: "Servidor não responde"

**Passos:**
1. Verifique logs no Railway
2. Certifique-se que o deploy terminou (status verde)
3. Teste a rota `/health` no navegador
4. Verifique se a URL no banco está correta

### Erro: "Timeout ao conectar WebSocket"

**Passos:**
1. Verifique se o servidor está rodando (logs do Railway)
2. Teste se a porta está aberta: `telnet sua-url-railway.up.railway.app 443`
3. Limpe o cache do navegador (Ctrl+Shift+Delete)

### Erro: "QR Code não aparece"

**Passos:**
1. Verifique console do navegador (F12)
2. Veja se há erros de CORS
3. Certifique-se que o servidor tem a variável `TENANT_ID` correta

### Erro: "Cannot find module 'whatsapp-web.js'"

**Passos:**
1. Vá em Railway → Settings
2. Verifique se o Build Command está correto:
   ```bash
   cp package-servidor-railway.json package.json && npm install
   ```
3. Force um novo deploy

---

## 💰 Custos Railway

**Plano Gratuito:**
- ✅ 500 horas/mês grátis
- ✅ $5 de crédito/mês
- ✅ Sem cartão de crédito inicialmente

**Quando cobram:**
- Se ultrapassar 500h/mês
- Se usar mais de $5/mês em recursos

**Para projetos pequenos:** Permanece 100% gratuito!

---

## 🔄 Atualizações Futuras

**Toda vez que você fizer mudanças no código:**

1. Edite no Lovable
2. Salve (Ctrl+S)
3. Lovable sincroniza com GitHub automaticamente
4. Railway detecta mudança no GitHub
5. Railway faz rebuild automático
6. Novo deploy em ~2 minutos
7. Zero downtime!

---

## 📝 Checklist Final

Marque cada item conforme completa:

- [ ] Arquivo `package-servidor-railway.json` criado
- [ ] Projeto conectado ao GitHub
- [ ] Conta Railway criada
- [ ] Projeto Railway criado e vinculado ao GitHub
- [ ] Variáveis de ambiente configuradas (4 variáveis)
- [ ] Build Command configurado
- [ ] Start Command configurado
- [ ] URL pública gerada e copiada
- [ ] Banco de dados atualizado com nova URL
- [ ] Teste `/health` funcionando
- [ ] QR Code apareceu no site
- [ ] WhatsApp conectado com sucesso
- [ ] Badge verde no site

---

## 🆘 Precisa de Ajuda?

Se travou em algum passo:

1. **Me avise QUAL passo** você está
2. **Envie screenshot** do erro (se houver)
3. **Copie os logs** do Railway (se houver erro)
4. **Me diga**: qual mensagem de erro apareceu?

**Estou aqui para ajudar!** 💪

---

## 🎯 Próximos Passos

Depois que tudo funcionar:

1. ✅ Teste enviar mensagem manual via WhatsApp Integration
2. ✅ Configure templates de mensagens automáticas
3. ✅ Monitore logs no Railway para garantir estabilidade
4. ✅ Adicione outros tenants (se necessário)

---

**Boa sorte com o deploy! Você consegue! 🚀**

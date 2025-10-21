# 🚀 Deploy do Servidor WhatsApp no Railway

## Pré-requisitos

- Conta no GitHub (gratuita)
- Código do projeto no GitHub
- 5-10 minutos

---

## Passo 1: Preparar o Projeto

### 1.1 Criar arquivo `package.json` para o servidor

Crie um arquivo chamado `package-servidor-railway.json` na raiz do projeto:

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

### 1.2 Fazer commit e push para o GitHub

```bash
git add package-servidor-railway.json
git commit -m "Add Railway deployment config"
git push origin main
```

---

## Passo 2: Criar Conta no Railway

1. Acesse: https://railway.app
2. Clique em **"Start a New Project"**
3. Faça login com sua conta GitHub
4. Autorize o Railway a acessar seus repositórios

---

## Passo 3: Deploy do Projeto

### 3.1 Novo Projeto

1. No dashboard do Railway, clique em **"New Project"**
2. Selecione **"Deploy from GitHub repo"**
3. Escolha seu repositório **orderzaps** (ou o nome do seu projeto)

### 3.2 Configurar o Build

Na configuração do projeto:

1. **Build Command**: 
   ```bash
   cp package-servidor-railway.json package.json && npm install
   ```

2. **Start Command**:
   ```bash
   npm start
   ```

3. **Root Directory**: `/` (deixe vazio ou raiz)

### 3.3 Adicionar Variáveis de Ambiente

No Railway, vá em **Variables** e adicione:

```bash
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
PORT=3333
NODE_ENV=production
ORDERZAPS_PROGRAMDATA=/app/.orderzaps_data
```

**Importante**: Substitua `TENANT_ID` pelo ID do seu tenant real.

---

## Passo 4: Obter URL Pública

1. No Railway, vá na aba **Settings**
2. Em **Networking**, clique em **Generate Domain**
3. O Railway vai gerar uma URL como:
   ```
   https://seu-projeto-production.up.railway.app
   ```
4. **Copie esta URL** - você vai precisar dela!

---

## Passo 5: Configurar Porta no Código

O Railway automaticamente define a porta via variável `PORT`. 

Verifique se seu `server-whatsapp-individual.js` usa:

```javascript
const PORT = process.env.PORT || 3333;
```

Se não tiver, atualize o código para usar `process.env.PORT`.

---

## Passo 6: Atualizar Banco de Dados

### 6.1 Via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx
2. Vá em **SQL Editor**
3. Execute:

```sql
UPDATE integration_whatsapp 
SET api_url = 'https://sua-url-railway.up.railway.app'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

**⚠️ Importante**: Substitua `sua-url-railway.up.railway.app` pela URL real do Railway.

### 6.2 Via Frontend (alternativo)

Ou crie uma página de configuração no frontend para atualizar a URL.

---

## Passo 7: Testar a Conexão

1. Acesse seu site: `https://app.orderzaps.com`
2. Vá em **WhatsApp → Integração WhatsApp**
3. Clique em **Conectar WhatsApp**
4. O QR Code deve aparecer
5. Escaneie com seu celular

---

## 🔍 Troubleshooting

### Erro: "Servidor não responde"

**Verificar logs no Railway:**
1. Vá no projeto Railway
2. Aba **Deployments**
3. Clique no deployment ativo
4. Veja os logs em tempo real

**Comandos úteis nos logs:**
```bash
# Ver se o servidor iniciou
Server running on port 3333

# Ver conexões WebSocket
WebSocket connected for tenant: xxxxx
```

### Erro: "Cannot find module whatsapp-web.js"

**Solução**: Certifique-se que o Build Command está correto:
```bash
cp package-servidor-railway.json package.json && npm install
```

### Erro: EBUSY / Session Locked

**Solução**: O Railway persiste os dados entre deploys.

1. No Railway, vá em **Data**
2. Delete a pasta `.orderzaps_data` se necessário
3. Reconecte o WhatsApp

---

## 📊 Monitoramento

### Ver Logs em Tempo Real

No Railway:
- **Deployments** → Deployment ativo → **View Logs**

### Verificar Status

```bash
curl https://sua-url-railway.up.railway.app/health
```

Deve retornar:
```json
{"status":"ok"}
```

---

## 💰 Custos

**Plano Gratuito Railway:**
- ✅ 500 horas/mês grátis
- ✅ $5 de crédito/mês
- ✅ Suficiente para 1-2 projetos pequenos
- ⚠️ Depois precisa adicionar cartão (mas continua gratuito se não ultrapassar)

**Estimativa para WhatsApp:**
- Servidor pequeno: ~$0-5/mês
- Sempre rodando 24/7

---

## 🔄 Atualizações Futuras

Toda vez que você fizer `git push`:
1. Railway detecta automaticamente
2. Faz rebuild
3. Deploy automático
4. Zero downtime

---

## ✅ Checklist Final

- [ ] Projeto no GitHub
- [ ] package-servidor-railway.json criado
- [ ] Deploy no Railway feito
- [ ] Variáveis de ambiente configuradas
- [ ] URL pública gerada
- [ ] Banco de dados atualizado com nova URL
- [ ] Teste de conexão funcionando

---

## 🆘 Precisa de Ajuda?

Se encontrar problemas:

1. **Verifique os logs no Railway** primeiro
2. **Teste a rota /health** via curl/browser
3. **Verifique se a URL no banco está correta**
4. **Certifique-se que TENANT_ID está correto**

---

## 📝 Notas Importantes

- ⚠️ **NÃO use `localhost` em produção**
- ✅ Use sempre a URL pública do Railway
- 🔒 A sessão do WhatsApp persiste entre deploys
- 🔄 Se mudar de conta Railway, precisa novo QR Code

---

**Pronto!** Agora seu servidor WhatsApp está online 24/7 e acessível de qualquer lugar! 🎉

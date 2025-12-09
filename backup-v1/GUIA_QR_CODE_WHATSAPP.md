# 🔍 Guia: QR Code do WhatsApp Não Aparece

## 🚨 Problema

O sistema não está gerando o QR Code para conectar o WhatsApp.

---

## ✅ Solução: Servidor com Debug de QR Code

Criei um servidor especial **`server-whatsapp-qr-debug.js`** que:

- ✅ **Força a geração do QR Code**
- ✅ **Imprime o QR direto no terminal** (backup)
- ✅ **Salva QR como arquivo PNG** (para visualizar)
- ✅ **Aguarda até 30 segundos** para gerar o QR
- ✅ **Logs detalhados** de cada passo
- ✅ **Endpoint para forçar geração** de novo QR

---

## 🚀 Como Testar Localmente

### Passo 1: Instalar Dependências

```bash
cd backend
npm install @whiskeysockets/baileys qrcode qrcode-terminal express cors fs-extra dotenv @hapi/boom
```

### Passo 2: Limpar Sessões Antigas

```bash
# Remover todas as sessões
rm -rf baileys_auth/*

# Ou remover apenas uma específica
rm -rf baileys_auth/SEU_TENANT_ID
```

### Passo 3: Iniciar Servidor de Debug

```bash
# Rodar diretamente
node server-whatsapp-qr-debug.js

# Ou com PM2
pm2 start server-whatsapp-qr-debug.js --name whatsapp-debug
pm2 logs whatsapp-debug
```

### Passo 4: Testar Geração de QR

#### Método 1: Via GET /qr/:tenantId

```bash
# Obter QR Code
curl http://localhost:3333/qr/SEU_TENANT_ID

# Resposta esperada:
{
  "ok": true,
  "tenantId": "xxx",
  "qr": "data:image/png;base64,...",
  "qrString": "código-do-qr",
  "status": "qr",
  "message": "Escaneie o QR Code com o WhatsApp"
}
```

#### Método 2: Forçar Geração

```bash
# Forçar nova geração
curl -X POST http://localhost:3333/generate-qr/SEU_TENANT_ID

# Aguarda 30 segundos e tenta gerar
# Depois use:
curl http://localhost:3333/qr/SEU_TENANT_ID
```

### Passo 5: Visualizar QR Code

O servidor cria automaticamente um arquivo PNG:

```bash
# Ver onde foi salvo
ls -la backend/baileys_auth/*.png

# Abrir o arquivo PNG
# Linux:
xdg-open backend/baileys_auth/SEU_TENANT_ID_qr.png

# Mac:
open backend/baileys_auth/SEU_TENANT_ID_qr.png

# Windows:
start backend/baileys_auth/SEU_TENANT_ID_qr.png
```

---

## 🔍 Diagnóstico

### Ver Logs Detalhados

```bash
# Se usando PM2
pm2 logs whatsapp-debug

# Procure por:
[QR CODE] ╔════════════════════════════════════════╗
[QR CODE] ║  QR CODE GERADO PARA: xxxxx...       ║
[SUCCESS] QR Code convertido para DataURL com sucesso!
[SUCCESS] QR Code salvo em: /caminho/para/arquivo.png
```

### Verificar Status

```bash
# Status do tenant específico
curl http://localhost:3333/status/SEU_TENANT_ID

# Resposta:
{
  "ok": true,
  "tenantId": "xxx",
  "status": "qr",           # Deve estar "qr" ou "connecting"
  "hasQR": true,            # Deve ser true
  "hasQRString": true,      # Deve ser true
  "connectionAttempts": 1
}
```

---

## 🐛 Possíveis Problemas

### Problema 1: Status fica em "connecting" e não gera QR

**Causa**: Baileys não consegue se conectar ao WhatsApp

**Solução**:
```bash
# 1. Verificar conexão de internet
ping wa.me

# 2. Resetar completamente
curl -X POST http://localhost:3333/reset/SEU_TENANT_ID

# 3. Aguardar 30 segundos
sleep 30

# 4. Forçar geração
curl -X POST http://localhost:3333/generate-qr/SEU_TENANT_ID

# 5. Obter QR
curl http://localhost:3333/qr/SEU_TENANT_ID
```

### Problema 2: Erro ao gerar QR Code

**Causa**: Dependência `qrcode` não instalada ou com problema

**Solução**:
```bash
cd backend

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Verificar se qrcode está instalado
npm list qrcode
```

### Problema 3: QR Code gerado mas não aparece na resposta

**Causa**: Pode estar demorando para converter para DataURL

**Solução**:
```bash
# Use o endpoint que aguarda 30 segundos
curl http://localhost:3333/qr/SEU_TENANT_ID

# Se não funcionar, veja o arquivo PNG salvo
ls backend/baileys_auth/*.png
```

### Problema 4: "Tenant não tem integração WhatsApp ativa"

**Causa**: Não existe registro no Supabase para esse tenant

**Solução**:
```sql
-- No Supabase SQL Editor
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  is_active
) VALUES (
  'SEU_TENANT_ID',
  'instancia_principal',
  'http://localhost:3333',
  true
);
```

---

## 📋 Checklist de Debug

Antes de pedir ajuda, verifique:

- [ ] Servidor está rodando (porta 3333)?
- [ ] Dependências estão instaladas?
- [ ] Pasta `baileys_auth` existe?
- [ ] Tenant existe no Supabase?
- [ ] Conexão com internet funciona?
- [ ] Arquivo PNG do QR foi criado?
- [ ] Status do cliente está como "qr" ou "connecting"?
- [ ] Logs mostram "QR CODE GERADO"?

---

## 🎯 Testes Rápidos

### Teste 1: Health Check

```bash
curl http://localhost:3333/

# Deve retornar:
{
  "ok": true,
  "service": "WhatsApp Multi-Tenant API (QR Debug)",
  "version": "2.2.0",
  "clients": []
}
```

### Teste 2: Ver Todos os Clientes

```bash
curl http://localhost:3333/status

# Mostra todos os tenants conectados
```

### Teste 3: Fluxo Completo

```bash
# 1. Reset
curl -X POST http://localhost:3333/reset/SEU_TENANT_ID

# 2. Aguardar
sleep 5

# 3. Obter status
curl http://localhost:3333/status/SEU_TENANT_ID

# 4. Forçar geração (se necessário)
curl -X POST http://localhost:3333/generate-qr/SEU_TENANT_ID

# 5. Aguardar QR
sleep 10

# 6. Obter QR
curl http://localhost:3333/qr/SEU_TENANT_ID
```

---

## 📸 Como Usar o QR Code Gerado

### Opção 1: DataURL (Resposta da API)

```javascript
// No frontend
const response = await fetch('http://localhost:3333/qr/TENANT_ID');
const data = await response.json();

if (data.ok && data.qr) {
  // Exibir imagem
  document.getElementById('qr-image').src = data.qr;
}
```

### Opção 2: Arquivo PNG

1. Servidor salva automaticamente em: `backend/baileys_auth/TENANT_ID_qr.png`
2. Abra o arquivo no navegador ou aplicativo de imagens
3. Escaneie com o WhatsApp no celular

### Opção 3: Terminal (Backup)

O servidor imprime o QR direto no console:
```
[QR CODE] ╔════════════════════════════════════════╗
[QR CODE] ║  QR CODE GERADO PARA: xxxxx...       ║
[QR CODE] ╚════════════════════════════════════════╝

█▀▀▀▀▀█ ▀▄▀█▀  ... (QR Code ASCII)
```

---

## 🔧 Configurações Avançadas

### Ajustar Tempo de Espera

Edite `server-whatsapp-qr-debug.js`:

```javascript
// Linha ~510 - Aumentar tempo de espera
for (let i = 0; i < 60; i++) {  // De 30 para 60 segundos
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (clientData.qr || clientData.qrString) {
    break;
  }
}
```

### Forçar Impressão no Terminal

```javascript
// Linha ~168
printQRInTerminal: true,  // Sempre true para debug
```

### Qualidade do QR Code

```javascript
// Linha ~189
const qrDataUrl = await QRCode.toDataURL(qr, { 
  margin: 4,        // Aumentar margem
  scale: 12,        // Aumentar escala (maior qualidade)
  errorCorrectionLevel: 'H',  // Máxima correção de erro
});
```

---

## 📊 Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/` | Health check |
| GET | `/status` | Status de todos os clientes |
| GET | `/status/:tenantId` | Status de um cliente |
| GET | `/qr/:tenantId` | **Obter QR Code** |
| POST | `/generate-qr/:tenantId` | **Forçar geração de QR** |
| POST | `/send` | Enviar mensagem |
| POST | `/reset/:tenantId` | Resetar cliente |
| POST | `/disconnect/:tenantId` | Desconectar |

---

## 🚀 Deploy no Railway

### Atualizar para usar o novo servidor:

```bash
# 1. Commit e push
git add backend/server-whatsapp-qr-debug.js
git commit -m "feat: Adiciona servidor de debug para QR Code"
git push origin main

# 2. No Railway
# Settings > Environment Variables
# Adicionar ou editar:
START_COMMAND=node backend/server-whatsapp-qr-debug.js

# 3. Redeploy
```

### Verificar Logs no Railway:

1. Vá em **Deployments** > **View Logs**
2. Procure por:
   ```
   [QR CODE] ╔════════════════════════════════════════╗
   [SUCCESS] QR Code convertido para DataURL
   [SUCCESS] QR Code salvo em: /caminho
   ```

---

## 💡 Dicas

1. **Sempre limpe as sessões** antes de testar:
   ```bash
   rm -rf backend/baileys_auth/*
   ```

2. **Use o endpoint `/generate-qr`** se o GET não funcionar

3. **Verifique o arquivo PNG** salvo como backup

4. **Aguarde pelo menos 10-30 segundos** para o QR ser gerado

5. **Não tente conectar múltiplas vezes** rapidamente (causa erro 405)

---

## 🆘 Suporte

Se ainda não funcionar:

1. ✅ Execute o **Checklist de Debug**
2. ✅ Capture os **logs completos**
3. ✅ Verifique se o **arquivo PNG** foi criado
4. ✅ Confirme que a **internet** está funcionando
5. ✅ Tente com outro **tenant ID**

---

**Última atualização**: 06/12/2025  
**Arquivo**: `backend/server-whatsapp-qr-debug.js`

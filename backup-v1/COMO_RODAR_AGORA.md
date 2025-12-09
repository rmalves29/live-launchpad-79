# 🚀 Como Rodar o Servidor WhatsApp AGORA

## ⚡ Solução Rápida (SEM PM2)

### 1️⃣ MÉTODO MAIS SIMPLES - Execute este comando:

```bash
cd /home/user/webapp/backend && node server-whatsapp-alternative.js
```

Pronto! O servidor vai iniciar e mostrar:
- ✅ Porta em que está rodando (normalmente 3333)
- 🔄 Status de conexão
- 📱 QR Code quando disponível

---

## 📋 Passo a Passo Detalhado

### 1. Navegue para a pasta correta:
```bash
cd /home/user/webapp/backend
```

### 2. Limpe sessões antigas (IMPORTANTE):
```bash
rm -rf baileys_auth*
```

### 3. Inicie o servidor:
```bash
node server-whatsapp-alternative.js
```

### 4. Em outro terminal, teste o QR Code:
```bash
curl http://localhost:3333/qr/SEU_TENANT_ID
```

---

## 🔧 Alternativas de Execução

### Opção A - Com nohup (roda em background):
```bash
cd /home/user/webapp/backend
nohup node server-whatsapp-alternative.js > whatsapp.log 2>&1 &
```

Para ver os logs:
```bash
tail -f /home/user/webapp/backend/whatsapp.log
```

Para parar:
```bash
pkill -f "node server-whatsapp-alternative"
```

### Opção B - Com screen (recomendado):
```bash
# Instalar screen se necessário
sudo apt install screen -y

# Iniciar em sessão screen
cd /home/user/webapp/backend
screen -S whatsapp
node server-whatsapp-alternative.js

# Desanexar: Ctrl+A depois D
# Reanexar: screen -r whatsapp
```

### Opção C - Instalar PM2 (opcional):
```bash
npm install -g pm2
cd /home/user/webapp/backend
pm2 start server-whatsapp-alternative.js --name whatsapp-alt
pm2 logs whatsapp-alt
```

---

## 🩺 Diagnóstico de Problemas

### ❌ Erro: "Cannot find module"
```bash
cd /home/user/webapp/backend
npm install
```

### ❌ Erro 405 (IP Bloqueado)
**PARE TUDO e aguarde 20 minutos:**
```bash
pkill -f "node server-whatsapp"
rm -rf baileys_auth*
sleep 1200  # 20 minutos
node server-whatsapp-alternative.js
```

### ❌ Porta já em uso
```bash
# Encontrar processo na porta 3333
lsof -i :3333
# ou
netstat -tulpn | grep 3333

# Matar processo
kill -9 PID_DO_PROCESSO
```

### ❌ Node.js não encontrado
```bash
# Verificar versão
node --version

# Instalar se necessário (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## ✅ Checklist de Verificação

Antes de rodar, certifique-se:

- [ ] Está na pasta `/home/user/webapp/backend`
- [ ] Limpou as sessões antigas (`rm -rf baileys_auth*`)
- [ ] Aguardou 20+ minutos desde o último erro 405
- [ ] Não tem outro servidor WhatsApp rodando
- [ ] Porta 3333 está livre
- [ ] Variáveis de ambiente configuradas (`.env`)

---

## 🌐 Mudando o IP (Se Persistir o Erro 405)

### 1. Reiniciar Roteador (80% de eficácia)
```bash
# Anotar IP atual
curl ifconfig.me

# Desligue o roteador por 5 minutos
# Ligue novamente

# Verificar novo IP
curl ifconfig.me
```

### 2. Usar VPN (95% de eficácia)
```bash
# Instalar Windscribe (exemplo)
sudo apt install windscribe-cli -y
windscribe login
windscribe connect

# Verificar IP
curl ifconfig.me
```

---

## 📞 URLs do Servidor

Com o servidor rodando, você pode acessar:

- **Status Geral:** `http://localhost:3333/`
- **QR Code:** `http://localhost:3333/qr/SEU_TENANT_ID`
- **Gerar Novo QR:** `POST http://localhost:3333/generate-qr/SEU_TENANT_ID`
- **Reset Conexão:** `POST http://localhost:3333/reset/SEU_TENANT_ID`

---

## 📚 Documentação Relacionada

- `IP_BLOQUEADO_PERSISTENTE.md` - Soluções para IP bloqueado
- `ERRO_405_SOLUCAO_DEFINITIVA.md` - Erro 405 detalhado
- `GUIA_QR_CODE_WHATSAPP.md` - Troubleshooting QR Code
- `README_WHATSAPP_FIX.md` - Correções gerais

---

## 🎯 Comando Direto (Copie e Cole)

```bash
cd /home/user/webapp/backend && rm -rf baileys_auth* && node server-whatsapp-alternative.js
```

Este comando:
1. Vai para a pasta correta
2. Limpa sessões antigas
3. Inicia o servidor

**Pronto para uso! 🚀**

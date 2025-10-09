# 🚀 Guia: Servidores WhatsApp Individuais por Tenant

## 📋 Visão Geral

Cada empresa (tenant) roda seu próprio servidor Node.js independente:
- **Total isolamento** entre empresas
- **Porta exclusiva** para cada tenant
- **Sessão WhatsApp separada** por empresa
- **Configuração individual** via variáveis de ambiente

---

## 🏢 Empresas Configuradas

### Empresa 1: Mania de Mulher
- **Porta:** 3333
- **Script Windows:** `start-empresa1.bat`
- **Script Linux/Mac:** `start-empresa1.sh`
- **URL:** http://localhost:3333

### Empresa 2
- **Porta:** 3334
- **Script Windows:** `start-empresa2.bat`
- **Script Linux/Mac:** `start-empresa2.sh`
- **URL:** http://localhost:3334
- **⚠️ Configure o TENANT_ID no script antes de usar!**

---

## 🚀 Como Iniciar um Servidor

### Windows

```bash
# Empresa 1 (Mania de Mulher)
start-empresa1.bat

# Empresa 2
start-empresa2.bat
```

### Linux/Mac

```bash
# Dar permissão de execução (apenas primeira vez)
chmod +x start-empresa1.sh
chmod +x start-empresa2.sh

# Empresa 1 (Mania de Mulher)
./start-empresa1.sh

# Empresa 2
./start-empresa2.sh
```

---

## 📱 Primeira Conexão (QR Code)

1. Execute o script da empresa
2. Abra o navegador em `http://localhost:PORTA`
3. Escaneie o QR Code com o WhatsApp da empresa
4. Aguarde a mensagem "✅ WhatsApp CONECTADO e PRONTO!"

**Importante:** Cada empresa precisa escanear com seu próprio WhatsApp!

---

## ➕ Adicionar Nova Empresa

### Passo 1: Obter o Tenant ID

Execute no Supabase SQL Editor:

```sql
SELECT id, name, slug FROM tenants WHERE is_active = true;
```

### Passo 2: Criar Scripts de Inicialização

**Windows (`start-empresa3.bat`):**
```batch
@echo off
echo ================================================
echo  WhatsApp Server - NOME DA EMPRESA
echo ================================================
echo.

set COMPANY_NAME=Nome da Empresa
set TENANT_ID=uuid-do-tenant-aqui
set PORT=3335
set SUPABASE_SERVICE_KEY=sua-chave-aqui

echo 🏢 Empresa: %COMPANY_NAME%
echo 🔌 Porta: %PORT%
echo.

node server-whatsapp-individual.js

pause
```

**Linux/Mac (`start-empresa3.sh`):**
```bash
#!/bin/bash
echo "================================================"
echo "  WhatsApp Server - NOME DA EMPRESA"
echo "================================================"
echo ""

export COMPANY_NAME="Nome da Empresa"
export TENANT_ID="uuid-do-tenant-aqui"
export PORT=3335
export SUPABASE_SERVICE_KEY="sua-chave-aqui"

echo "🏢 Empresa: $COMPANY_NAME"
echo "🔌 Porta: $PORT"
echo ""

node server-whatsapp-individual.js
```

### Passo 3: Configurar no Supabase

Atualize a tabela `integration_whatsapp`:

```sql
UPDATE integration_whatsapp 
SET 
  api_url = 'http://localhost:3335',
  is_active = true
WHERE tenant_id = 'uuid-do-tenant-aqui';
```

---

## 🔌 API Endpoints

Cada servidor expõe as mesmas rotas na sua porta:

### Status do Servidor
```bash
GET http://localhost:PORTA/status
```

### Enviar Mensagem
```bash
POST http://localhost:PORTA/send
Content-Type: application/json

{
  "phone": "5511999999999",
  "message": "Olá!"
}
```

### Envio em Massa
```bash
POST http://localhost:PORTA/broadcast
Content-Type: application/json

{
  "phones": ["5511999999999", "5511888888888"],
  "message": "Mensagem para todos",
  "delay": 2000
}
```

### Reiniciar Conexão
```bash
POST http://localhost:PORTA/restart
```

---

## 🔧 Gerenciamento

### Verificar Servidores Rodando

**Windows:**
```bash
netstat -ano | findstr "333"
```

**Linux/Mac:**
```bash
lsof -i :3333
lsof -i :3334
```

### Parar um Servidor

Pressione `Ctrl + C` no terminal onde o servidor está rodando.

### Rodar em Background (Linux/Mac)

**Com PM2:**
```bash
# Instalar PM2
npm install -g pm2

# Iniciar servidores
pm2 start start-empresa1.sh --name "empresa1"
pm2 start start-empresa2.sh --name "empresa2"

# Gerenciar
pm2 list
pm2 logs empresa1
pm2 restart empresa1
pm2 stop empresa1
```

---

## 📊 Monitoramento

### Logs em Tempo Real

Os logs aparecem no terminal onde o servidor foi iniciado:

- `📨` Mensagens recebidas
- `✅` Envios bem-sucedidos
- `❌` Erros
- `🔄` Reconexões

### Verificar Status via API

```bash
curl http://localhost:3333/status
curl http://localhost:3334/status
```

---

## 🐛 Troubleshooting

### Erro: "Porta já em uso"

Verifique se outro processo está usando a porta:

```bash
# Windows
netstat -ano | findstr "3333"

# Linux/Mac
lsof -i :3333
```

### WhatsApp Desconecta Sozinho

O servidor tem reconexão automática. Se persistir:

1. Pare o servidor (`Ctrl + C`)
2. Remova a sessão antiga:
   ```bash
   # Windows
   rmdir /s C:\ProgramData\OrderZaps\.wwebjs_auth\session-TENANT_ID

   # Linux/Mac
   rm -rf /ProgramData/OrderZaps/.wwebjs_auth/session-TENANT_ID
   ```
3. Reinicie o servidor
4. Escaneie o QR Code novamente

### Mensagens Não Enviam

1. Verifique o status: `GET http://localhost:PORTA/status`
2. Confirme que `clientStatus` é `online`
3. Verifique os logs no terminal

---

## ✅ Checklist Nova Empresa

- [ ] Obter `TENANT_ID` do Supabase
- [ ] Criar scripts de inicialização (`.bat` e `.sh`)
- [ ] Definir porta exclusiva (3333, 3334, 3335...)
- [ ] Atualizar `integration_whatsapp` no Supabase
- [ ] Iniciar servidor
- [ ] Escanear QR Code
- [ ] Testar envio de mensagem
- [ ] Configurar para rodar em background (opcional)

---

## 📦 Estrutura de Arquivos

```
projeto/
├── server-whatsapp-individual.js    # Servidor base
├── start-empresa1.bat               # Script Windows Empresa 1
├── start-empresa1.sh                # Script Linux/Mac Empresa 1
├── start-empresa2.bat               # Script Windows Empresa 2
├── start-empresa2.sh                # Script Linux/Mac Empresa 2
└── C:\ProgramData\OrderZaps\
    └── .wwebjs_auth\
        ├── session-tenant-1\        # Sessão WhatsApp Empresa 1
        └── session-tenant-2\        # Sessão WhatsApp Empresa 2
```

---

## 🆚 Individual vs Multi-Tenant

| Característica | Individual | Multi-Tenant |
|----------------|------------|--------------|
| Isolamento | Total | Compartilhado |
| Porta | Uma por empresa | Uma para todas |
| Gerenciamento | Simples | Complexo |
| Escalabilidade | Horizontal | Vertical |
| Memória | Mais uso | Menos uso |

**Use Individual quando:**
- Cada empresa tem seu próprio servidor/VPS
- Precisa de total isolamento
- Gerenciamento independente

**Use Multi-Tenant quando:**
- Um servidor centralizado
- Muitas empresas pequenas
- Economia de recursos

---

## 🔐 Segurança

- ⚠️ **Nunca exponha as portas diretamente na internet**
- ✅ Use um proxy reverso (Nginx) com SSL
- ✅ Configure firewall para permitir apenas IPs confiáveis
- ✅ Mantenha `SUPABASE_SERVICE_KEY` seguro

---

## 💡 Dicas

1. **Nomes descritivos** nos scripts facilitam identificação
2. **Portas sequenciais** (3333, 3334, 3335...) organizam melhor
3. **PM2** é ideal para produção (auto-restart, logs, cluster)
4. **Backup das sessões** evita ter que escanear QR toda hora
5. **Logs centralizados** ajudam no debug de múltiplas empresas

---

## 📞 Suporte

Para problemas, verifique:
1. Logs do servidor (terminal)
2. Tabela `whatsapp_messages` no Supabase
3. Status da API: `GET /status`

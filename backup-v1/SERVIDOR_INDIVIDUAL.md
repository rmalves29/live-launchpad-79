# Servidor WhatsApp Individual

Cada empresa roda sua própria instância do servidor WhatsApp em porta separada.

## 📋 Características

- ✅ **Isolamento Total**: Cada empresa tem seu próprio processo
- ✅ **Configuração Independente**: Arquivo `.env` por empresa
- ✅ **Porta Diferente**: Cada instância roda em porta própria
- ✅ **Sessão Separada**: Autenticação WhatsApp individual
- ✅ **Fácil Gerenciar**: Um processo por empresa
- ✅ **Triggers Automáticos**: Integrado com sistema de triggers do banco

## 🏢 Estrutura

```
project/
├── server-whatsapp-individual.js    # Servidor base (mesmo para todas)
├── config-mania-mulher.env          # Config Mania de Mulher
├── config-empresa2.env              # Config Empresa 2
├── config-empresa3.env              # Config Empresa 3
├── start-mania-mulher.sh            # Script iniciar Mania de Mulher
├── start-empresa2.sh                # Script iniciar Empresa 2
├── start-empresa3.sh                # Script iniciar Empresa 3
├── .wwebjs_auth_mania_mulher/       # Sessão WhatsApp Mania de Mulher
├── .wwebjs_auth_empresa2/           # Sessão WhatsApp Empresa 2
└── .wwebjs_auth_empresa3/           # Sessão WhatsApp Empresa 3
```

## ⚙️ Configuração por Empresa

### Passo 1: Criar arquivo de configuração

Copie o template e renomeie:

```bash
cp config-mania-mulher.env config-sua-empresa.env
```

### Passo 2: Editar configuração

Abra `config-sua-empresa.env` e configure:

```env
COMPANY_NAME="Nome da Sua Empresa"
TENANT_ID="uuid-do-tenant-no-banco"
PORT=3335  # Porta única para esta empresa
AUTH_FOLDER=".wwebjs_auth_sua_empresa"
SUPABASE_SERVICE_KEY="sua-chave-aqui"
```

**IMPORTANTE**: Cada empresa precisa de:
- ✅ `TENANT_ID` único (UUID do banco)
- ✅ `PORT` diferente (3333, 3334, 3335, etc.)
- ✅ `AUTH_FOLDER` diferente (pasta de autenticação)

### Passo 3: Obter TENANT_ID

```sql
-- Buscar UUID da empresa no Supabase
SELECT id, name, slug FROM tenants WHERE name = 'Nome da Empresa';
```

Copie o `id` para o campo `TENANT_ID`.

### Passo 4: Criar script de inicialização

Crie `start-sua-empresa.sh`:

```bash
#!/bin/bash
echo "🚀 Iniciando servidor Sua Empresa..."
export $(cat config-sua-empresa.env | xargs)
node server-whatsapp-individual.js
```

Dê permissão de execução:

```bash
chmod +x start-sua-empresa.sh
```

## 🚀 Iniciar Servidores

### Mania de Mulher (Porta 3333)

```bash
./start-mania-mulher.sh
```

Ou manualmente:

```bash
export $(cat config-mania-mulher.env | xargs)
node server-whatsapp-individual.js
```

### Empresa 2 (Porta 3334)

```bash
./start-empresa2.sh
```

### Empresa 3 (Porta 3335)

```bash
./start-empresa3.sh
```

## 📱 QR Code

Na primeira execução, cada servidor mostrará seu próprio QR Code:

```
📱 Escaneie o QR Code para Mania de Mulher:

█████████████████████████████
█████████████████████████████
██ ▄▄▄▄▄ █▀ █▀▀██ ▄▄▄▄▄ ██
██ █   █ █▀▀▄ ▀█ █   █ ██
...
```

Escaneie com o WhatsApp da empresa correspondente.

## 🔍 Verificar Status

### Mania de Mulher
```bash
curl http://localhost:3333/status
```

### Empresa 2
```bash
curl http://localhost:3334/status
```

### Todas
```bash
curl http://localhost:3333/status
curl http://localhost:3334/status
curl http://localhost:3335/status
```

## 📡 Endpoints por Empresa

Cada instância tem os mesmos endpoints, mas em porta diferente:

### Status
```
GET http://localhost:PORT/status
```

### Health
```
GET http://localhost:PORT/health
```

### Enviar Mensagem
```
POST http://localhost:PORT/send
Body: {
  "number": "31999999999",
  "message": "Mensagem aqui"
}
```

### Broadcast
```
POST http://localhost:PORT/broadcast
Body: {
  "phones": ["31999999999", "31888888888"],
  "message": "Mensagem em massa"
}
```

### Reiniciar
```
POST http://localhost:PORT/restart
```

## 🔧 Configurar no Supabase

Cada empresa precisa ter o `api_url` correto na tabela `integration_whatsapp`:

```sql
-- Mania de Mulher
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3333'
WHERE tenant_id = 'uuid-mania-mulher';

-- Empresa 2
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3334'
WHERE tenant_id = 'uuid-empresa2';

-- Empresa 3
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3335'
WHERE tenant_id = 'uuid-empresa3';
```

**IMPORTANTE**: Se os servidores estiverem em máquinas diferentes, use o IP da máquina:

```sql
UPDATE integration_whatsapp 
SET api_url = 'http://192.168.1.100:3333'
WHERE tenant_id = 'uuid-mania-mulher';
```

## 🖥️ Rodar em Background

### Usando `screen`

```bash
# Mania de Mulher
screen -S mania-mulher
./start-mania-mulher.sh
# Pressione Ctrl+A, depois D para sair

# Empresa 2
screen -S empresa2
./start-empresa2.sh
# Pressione Ctrl+A, depois D para sair

# Ver sessões ativas
screen -ls

# Reconectar
screen -r mania-mulher
```

### Usando `pm2`

```bash
# Instalar pm2
npm install -g pm2

# Iniciar Mania de Mulher
pm2 start server-whatsapp-individual.js \
  --name "whatsapp-mania-mulher" \
  --env config-mania-mulher.env

# Iniciar Empresa 2
pm2 start server-whatsapp-individual.js \
  --name "whatsapp-empresa2" \
  --env config-empresa2.env

# Ver status
pm2 list

# Ver logs
pm2 logs whatsapp-mania-mulher
pm2 logs whatsapp-empresa2

# Parar
pm2 stop whatsapp-mania-mulher

# Reiniciar
pm2 restart whatsapp-mania-mulher
```

### Usando `nohup`

```bash
# Mania de Mulher
nohup ./start-mania-mulher.sh > mania-mulher.log 2>&1 &

# Empresa 2
nohup ./start-empresa2.sh > empresa2.log 2>&1 &

# Ver logs
tail -f mania-mulher.log
tail -f empresa2.log

# Parar (encontrar PID primeiro)
ps aux | grep server-whatsapp-individual
kill <PID>
```

## 📊 Monitoramento

### Ver processos ativos

```bash
ps aux | grep server-whatsapp-individual
```

Saída:
```
user  12345  node server-whatsapp-individual.js  (Mania de Mulher - Porta 3333)
user  12346  node server-whatsapp-individual.js  (Empresa 2 - Porta 3334)
```

### Ver portas em uso

```bash
lsof -i :3333
lsof -i :3334
lsof -i :3335
```

### Ver logs em tempo real

```bash
# Se usando pm2
pm2 logs whatsapp-mania-mulher --lines 50

# Se usando nohup
tail -f mania-mulher.log

# Se usando screen
screen -r mania-mulher
```

## 🔄 Reiniciar Servidor

### Via API
```bash
curl -X POST http://localhost:3333/restart
```

### Via Script
```bash
# Parar
pkill -f "server-whatsapp-individual.*3333"

# Iniciar
./start-mania-mulher.sh
```

### Via pm2
```bash
pm2 restart whatsapp-mania-mulher
```

## 🆚 Individual vs Multi-Tenant

| Característica | Individual | Multi-Tenant |
|---------------|-----------|--------------|
| Processos | Um por empresa | Um para todas |
| Configuração | Arquivo .env por empresa | Config única |
| Portas | Porta diferente por empresa | Porta única |
| Autenticação | QR Code separado | QR Code por tenant |
| Isolamento | Total | Lógico |
| Reiniciar | Reinicia só uma empresa | Reinicia todas |
| Memória | Mais memória | Menos memória |
| Complexidade | Simples | Mais complexo |

### Quando usar Individual?

- ✅ Poucas empresas (2-5)
- ✅ Empresas em servidores diferentes
- ✅ Necessidade de isolamento total
- ✅ Reiniciar uma empresa sem afetar outras
- ✅ Configurações muito diferentes por empresa

### Quando usar Multi-Tenant?

- ✅ Muitas empresas (10+)
- ✅ Todas em um servidor
- ✅ Configurações similares
- ✅ Economia de memória
- ✅ Gerenciamento centralizado

## 🐛 Troubleshooting

### Erro: TENANT_ID não configurado

```
❌ ERRO: TENANT_ID não configurado!
Configure a variável de ambiente TENANT_ID
```

**Solução**: Edite o arquivo `.env` e adicione o TENANT_ID correto.

### Erro: Porta já em uso

```
Error: listen EADDRINUSE: address already in use :::3333
```

**Solução**: 
1. Mude a porta no arquivo `.env`
2. Ou pare o processo usando a porta:
```bash
lsof -i :3333
kill <PID>
```

### WhatsApp não conecta

**Solução**:
1. Verifique status: `curl http://localhost:PORT/status`
2. Se status for `qr_code`, escaneie o QR Code
3. Se status for `offline`, reinicie: `POST /restart`

### Múltiplos processos da mesma empresa

```bash
# Matar todos os processos
pkill -f "server-whatsapp-individual"

# Iniciar novamente
./start-mania-mulher.sh
```

## 📝 Exemplo Completo

### 1. Adicionar nova empresa (Empresa 3)

```bash
# Criar config
cat > config-empresa3.env << EOF
COMPANY_NAME="Empresa 3"
TENANT_ID="uuid-da-empresa-3"
PORT=3335
AUTH_FOLDER=".wwebjs_auth_empresa3"
SUPABASE_SERVICE_KEY="chave-aqui"
EOF

# Criar script
cat > start-empresa3.sh << 'EOF'
#!/bin/bash
echo "🚀 Iniciando servidor Empresa 3..."
export $(cat config-empresa3.env | xargs)
node server-whatsapp-individual.js
EOF

# Permissão
chmod +x start-empresa3.sh

# Iniciar
./start-empresa3.sh
```

### 2. Configurar no banco

```sql
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  is_active,
  api_url,
  webhook_secret
) VALUES (
  'uuid-da-empresa-3',
  'Instância Empresa 3',
  true,
  'http://localhost:3335',
  'webhook-secret-123'
);
```

### 3. Testar

```bash
# Status
curl http://localhost:3335/status

# Enviar mensagem teste
curl -X POST http://localhost:3335/send \
  -H "Content-Type: application/json" \
  -d '{
    "number": "31999999999",
    "message": "Teste Empresa 3"
  }'
```

## ✅ Checklist Nova Empresa

- [ ] Criar arquivo `config-empresa.env`
- [ ] Configurar TENANT_ID (UUID do banco)
- [ ] Definir PORT única
- [ ] Definir AUTH_FOLDER único
- [ ] Criar script `start-empresa.sh`
- [ ] Dar permissão: `chmod +x start-empresa.sh`
- [ ] Inserir/atualizar `integration_whatsapp` no banco
- [ ] Iniciar servidor: `./start-empresa.sh`
- [ ] Escanear QR Code
- [ ] Verificar status: `curl localhost:PORT/status`
- [ ] Testar envio de mensagem

---

**Versão**: 1.0  
**Data**: Janeiro 2025  
**Compatível com**: Sistema de triggers automáticos

# Instalação do Sistema Multi-Tenant

## Pré-requisitos

- Node.js 18+ instalado
- Supabase configurado
- Sistema principal rodando

## Passo 1: Configuração do Servidor WhatsApp

### 1.1. Instalar Dependências

```bash
# Instalar dependências para o servidor WhatsApp
npm install whatsapp-web.js express cors qrcode-terminal node-fetch express-fileupload

# Opcional: instalar PM2 para gerenciamento em produção
npm install -g pm2
```

### 1.2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` ou configure as variáveis:

```bash
# Porta do servidor (padrão: 3333)
PORT=3333

# Chave de serviço do Supabase (obrigatória)
SUPABASE_SERVICE_KEY=sua_service_key_aqui

# URL do servidor WhatsApp para Edge Functions
WHATSAPP_MULTITENANT_URL=http://localhost:3333
```

### 1.3. Iniciar o Servidor

#### Desenvolvimento
```bash
# Usando o script fornecido
chmod +x start-multitenant.sh
./start-multitenant.sh

# Ou manualmente
node server-whatsapp-multitenant.js
```

#### Produção com PM2
```bash
# Iniciar com PM2
pm2 start server-whatsapp-multitenant.js --name "whatsapp-multitenant"

# Configurar para iniciar automaticamente
pm2 startup
pm2 save

# Monitorar logs
pm2 logs whatsapp-multitenant
```

## Passo 2: Configuração das Edge Functions

### 2.1. Adicionar Secret

Configure a URL do servidor WhatsApp no Supabase:

1. Acesse: Supabase Dashboard > Settings > Edge Functions
2. Adicione o secret: `WHATSAPP_MULTITENANT_URL` = `http://seu-servidor:3333`

### 2.2. Verificar Deploy

A Edge Function `whatsapp-multitenant` será deployada automaticamente.

## Passo 3: Configuração Inicial

### 3.1. Criar Super Administrador

Se ainda não existe, crie um super administrador:

```sql
-- Criar usuário super admin
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@sistema.com',
  now(),
  now(),
  now()
);

-- Criar perfil super admin
INSERT INTO profiles (id, email, role, created_at, updated_at)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@sistema.com'),
  'admin@sistema.com',
  'super_admin',
  now(),
  now()
);
```

### 3.2. Configurar Primeira Empresa

1. **Login como Super Admin**: Use as credenciais criadas acima
2. **Criar Empresa**: No painel de Super Admin, crie a primeira empresa
3. **Configurar Integração WhatsApp**: 

```sql
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active
) VALUES (
  'uuid-da-empresa-criada',
  'empresa_principal',
  'http://localhost:3333',
  'webhook-secret-seguro-123',
  true
);
```

## Passo 4: Conectar WhatsApp

### 4.1. Verificar Status

```bash
# Verificar se o servidor está rodando
curl http://localhost:3333/status

# Verificar status específico de uma empresa
curl http://localhost:3333/status/uuid-da-empresa
```

### 4.2. Conectar Instância

1. **Monitorar Logs**: Observe os logs do servidor para ver os QR codes
2. **Escanear QR**: Use o WhatsApp da empresa para escanear o QR code
3. **Confirmar Conexão**: Verifique o status para confirmar que está "online"

### 4.3. Testar Envio

```bash
# Testar envio de mensagem
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: uuid-da-empresa" \
  -d '{
    "phone": "5511999999999",
    "message": "Teste do sistema multi-tenant!"
  }'
```

## Passo 5: Configuração Avançada

### 5.1. Nginx Proxy (Produção)

```nginx
server {
    listen 80;
    server_name whatsapp.seudominio.com;

    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5.2. SSL com Certbot

```bash
# Instalar certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d whatsapp.seudominio.com
```

### 5.3. Firewall

```bash
# Permitir porta do WhatsApp
sudo ufw allow 3333/tcp

# Ou apenas para localhost se usando proxy
sudo ufw deny 3333/tcp
sudo ufw allow from 127.0.0.1 to any port 3333
```

## Passo 6: Monitoramento

### 6.1. Logs do Sistema

```bash
# PM2 logs
pm2 logs whatsapp-multitenant

# System logs
tail -f /var/log/syslog | grep whatsapp

# Logs do Supabase
# Acesse: Supabase Dashboard > Logs
```

### 6.2. Health Check

Crie um script de monitoramento:

```bash
#!/bin/bash
# health-check.sh

STATUS=$(curl -s http://localhost:3333/status | jq -r '.success')

if [ "$STATUS" = "true" ]; then
    echo "✅ Servidor WhatsApp Multi-Tenant OK"
    exit 0
else
    echo "❌ Servidor WhatsApp Multi-Tenant com problemas"
    # Reiniciar serviço
    pm2 restart whatsapp-multitenant
    exit 1
fi
```

### 6.3. Cron Job para Monitoramento

```bash
# Adicionar ao crontab
crontab -e

# Verificar a cada 5 minutos
*/5 * * * * /path/to/health-check.sh
```

## Passo 7: Migração de Dados (Se Necessário)

### 7.1. Backup dos Dados

```sql
-- Fazer backup das tabelas principais
pg_dump -h seu-host -U seu-usuario -d sua-database > backup-pre-multitenant.sql
```

### 7.2. Executar Migração

Use o script de migração fornecido no `GUIA_MULTITENANT.md`.

### 7.3. Verificar Migração

```sql
-- Verificar se todos os dados têm tenant_id
SELECT 
  'products' as tabela, 
  COUNT(*) as total, 
  COUNT(tenant_id) as com_tenant_id
FROM products
UNION ALL
SELECT 
  'customers', 
  COUNT(*), 
  COUNT(tenant_id)
FROM customers
-- ... etc
```

## Troubleshooting

### Problema: Servidor não inicia

**Soluções**:
1. Verificar se a porta está livre: `netstat -tulpn | grep 3333`
2. Verificar permissões de arquivos
3. Verificar variáveis de ambiente
4. Verificar logs: `pm2 logs whatsapp-multitenant`

### Problema: QR Code não aparece

**Soluções**:
1. Verificar se a integração WhatsApp está configurada
2. Reiniciar a instância: `curl -X POST http://localhost:3333/restart/tenant-id`
3. Verificar logs do servidor
4. Limpar cache de autenticação

### Problema: Mensagens não enviam

**Soluções**:
1. Verificar se o WhatsApp está conectado: `/status/tenant-id`
2. Verificar se o número está formatado corretamente
3. Verificar rate limits do WhatsApp
4. Verificar logs de erro

### Problema: Dados aparecem misturados

**Soluções**:
1. Verificar políticas RLS
2. Verificar se o usuário tem `tenant_id` correto
3. Verificar se as consultas estão filtrando por tenant
4. Verificar logs de auditoria

## Manutenção

### Limpeza de Logs

```bash
# Limpar logs do PM2
pm2 flush whatsapp-multitenant

# Limpar sessões antigas do WhatsApp
find .wwebjs_auth_tenants -name "*.log" -mtime +30 -delete
```

### Backup Regular

```bash
#!/bin/bash
# backup-sessions.sh

DATE=$(date +%Y%m%d_%H%M%S)
tar -czf "backup_whatsapp_sessions_$DATE.tar.gz" .wwebjs_auth_tenants/
find . -name "backup_whatsapp_sessions_*.tar.gz" -mtime +7 -delete
```

### Monitoramento de Desempenho

```bash
# Monitorar uso de recursos
pm2 monit

# Estatísticas detalhadas
pm2 show whatsapp-multitenant
```

## Suporte

Para suporte adicional:

1. Verifique os logs detalhados
2. Consulte a documentação do WhatsApp Web.js
3. Verifique issues conhecidos no GitHub
4. Entre em contato com a equipe de desenvolvimento
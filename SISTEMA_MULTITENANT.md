# Sistema Multi-Tenant - Como Funciona

## 📋 Visão Geral

O sistema foi configurado como **multi-tenant**, onde cada empresa tem seus próprios dados isolados e credenciais de integração separadas.

## 🏢 Como as Empresas Fazem Login

### 1. **Fluxo Principal**

1. **Página Inicial** (`/`) - Seletor de Empresas
   - Lista todas as empresas ativas do sistema
   - Usuários escolhem qual empresa querem acessar

2. **Login da Empresa** (`/empresa/{slug}/login`)
   - Cada empresa tem sua página de login exclusiva
   - URL exemplo: `/empresa/minha-loja/login`
   - Validação: usuário deve pertencer àquela empresa

3. **Dashboard da Empresa** (`/empresa/{slug}/dashboard`)
   - Dashboard específico da empresa
   - Dados isolados por tenant
   - Estatísticas e ações rápidas

### 2. **Estrutura de URLs**

```
/ - Seletor de empresas (página inicial)
/empresa/minha-loja/login - Login da "Minha Loja"
/empresa/minha-loja/dashboard - Dashboard da "Minha Loja"
/empresa/outra-empresa/login - Login da "Outra Empresa"
/admin - Área administrativa (só superadmins)
/dashboard - Dashboard administrativo global
```

### 3. **Níveis de Acesso**

#### **Superadmin (Master)**
- Acessa `/dashboard` - gerencia todas as empresas
- Pode criar/editar/desativar empresas
- Acessa todas as funcionalidades do sistema

#### **Tenant Admin** 
- Acessa apenas sua empresa via `/empresa/{slug}/`
- Configura integrações (Mercado Pago, Melhor Envio, WhatsApp)
- Gerencia usuários da empresa

#### **Operator**
- Acessa apenas sua empresa 
- Operações básicas (pedidos, produtos, clientes)
- Não vê credenciais de integração

## 🔐 Segurança e Isolamento

### **Row Level Security (RLS)**
- Todos os dados filtrados automaticamente por `tenant_id`
- Usuário só vê dados da sua empresa
- Impossível acessar dados de outras empresas

### **Webhooks Seguros**
- URLs por empresa: `/webhook-mercadopago/{tenant_key}`
- Validação via `X-Webhook-Secret` único por empresa
- Logs de webhook isolados por tenant

## 🛠️ Integrações por Empresa

### **Mercado Pago**
- Cada empresa tem suas credenciais MP
- Webhooks: `/webhook-mercadopago/{tenant_key}`
- Secret único por empresa

### **Melhor Envio**  
- Credenciais OAuth por empresa
- Webhooks: `/webhook-melhorenvio/{tenant_key}`
- Tokens isolados

### **WhatsApp**
- Instância própria por empresa
- Phone business único
- Webhooks: `/webhook-whatsapp/incoming/{tenant_key}`

## 📝 Como Configurar Nova Empresa

### 1. **Criar Empresa (Superadmin)**
```
1. Login como superadmin (/auth)
2. Ir para Dashboard (/dashboard) 
3. Aba "Gerenciar Empresas"
4. Criar nova empresa com:
   - Nome: "Minha Loja"
   - Slug: "minha-loja" 
   - Configurações básicas
```

### 2. **Configurar Usuário da Empresa**
```
1. Criar usuário no sistema
2. Atribuir tenant_id da empresa
3. Definir role (tenant_admin/operator)
```

### 3. **Configurar Integrações** 
```
1. Login na empresa (/empresa/minha-loja/login)
2. Ir para Integrações
3. Configurar:
   - Mercado Pago (credenciais)
   - Melhor Envio (OAuth)
   - WhatsApp (instância)
```

## 🔄 Webhooks Multi-Tenant

### **URLs por Empresa**
```
Mercado Pago: https://app.com/webhook-mercadopago/minha-loja
Melhor Envio: https://app.com/webhook-melhorenvio/minha-loja  
WhatsApp: https://app.com/webhook-whatsapp/incoming/minha-loja
```

### **Validação de Segurança**
```
Header: X-Webhook-Secret: {secret_da_empresa}
```

## 📊 Vantagens do Sistema

### ✅ **Isolamento Total**
- Dados completamente separados
- Credenciais isoladas
- Webhooks seguros

### ✅ **Escalabilidade**
- Suporta quantas empresas precisar
- Performance otimizada por RLS
- Fácil adicionar novas empresas

### ✅ **Segurança**
- RLS nativo do PostgreSQL
- Validação de webhook secrets
- Controle de acesso granular

### ✅ **Flexibilidade**
- Cada empresa configura suas integrações
- URLs personalizadas por empresa
- Dashboard próprio

## 🚀 Próximos Passos

1. **Testar o Sistema**
   - Criar empresa de teste
   - Configurar integrações
   - Testar webhooks

2. **Configurar WhatsApp Multi-Tenant**
   - Adaptar server-whatsapp.js
   - Carregar instâncias do Supabase
   - Mapear tenant_key → instance

3. **Personalização**
   - Logos por empresa
   - Cores personalizadas
   - Domínios próprios (futuro)

## 📞 Exemplos de Uso

### **Loja A** (`minha-loja`)
- URL: `/empresa/minha-loja/login`
- Webhooks: `/webhook-*/minha-loja`
- WhatsApp: instância `inst-minha-loja`

### **Loja B** (`outra-loja`)
- URL: `/empresa/outra-loja/login`  
- Webhooks: `/webhook-*/outra-loja`
- WhatsApp: instância `inst-outra-loja`

## ❓ Perguntas Frequentes

**Q: Como um usuário acessa múltiplas empresas?**
A: Atualmente um usuário pertence a uma empresa. Para múltiplas empresas, criar usuários separados ou implementar seletor de empresa.

**Q: Posso usar subdomínios?**
A: Sim! Futuro: `loja1.sistema.com`, `loja2.sistema.com`

**Q: Como migrar dados existentes?**
A: Atribuir `tenant_id` aos dados existentes para a empresa padrão.
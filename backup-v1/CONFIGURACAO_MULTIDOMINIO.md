# Configuração Multi-Domínio com Subdomínios

Este sistema agora suporta **um site por empresa** usando subdomínios. Cada empresa terá seu próprio site isolado.

## 🌐 Como Funciona

### Estrutura de URLs
- **Site Principal**: `meusite.com` → Área administrativa, criação de empresas
- **Site da Empresa 1**: `empresa1.meusite.com` → Dados isolados da Empresa 1
- **Site da Empresa 2**: `empresa2.meusite.com` → Dados isolados da Empresa 2

### Isolamento de Dados
- ✅ **Produtos**: Cada empresa vê apenas seus produtos
- ✅ **Clientes**: Cada empresa vê apenas seus clientes  
- ✅ **Pedidos**: Cada empresa vê apenas seus pedidos
- ✅ **Integrações**: WhatsApp, pagamento e frete independentes por empresa
- ✅ **Mensagens**: Sistema de mensagens isolado por empresa

## 🔧 Configuração DNS

### 1. No seu provedor de domínio (Registro.br, GoDaddy, etc.)

Adicione os seguintes registros DNS:

```
Tipo: A
Nome: @
Valor: 185.158.133.1

Tipo: A  
Nome: *
Valor: 185.158.133.1

Tipo: CNAME
Nome: www
Valor: meusite.com
```

### 2. No Lovable (Configuração de Domínio)

1. Acesse **Configurações do Projeto** → **Domains**
2. Adicione seu domínio principal: `meusite.com`
3. O registro `*` (wildcard) capturará todos os subdomínios automaticamente

## 🚀 Como Usar

### Para o Super Admin (Site Principal)
1. Acesse `meusite.com`
2. Faça login como super admin
3. Vá em **Configurações** → **Gerenciar Empresas**
4. Crie uma nova empresa com slug `empresa1`
5. O sistema criará automaticamente `empresa1.meusite.com`

### Para a Empresa
1. Acesse `empresa1.meusite.com`
2. O sistema detecta automaticamente que é a "empresa1"
3. Todos os dados ficam isolados para essa empresa
4. O admin da empresa pode gerenciar:
   - Produtos próprios
   - Clientes próprios
   - Integração WhatsApp própria
   - Configurações de frete próprias

## 🔐 Segurança e Isolamento

### Filtros Automáticos
O sistema aplica automaticamente `tenant_id = "empresa1"` em todas as consultas quando acessado via `empresa1.meusite.com`.

### Tabelas Isoladas por Tenant
- `products` → Filtradas por `tenant_id`
- `customers` → Filtradas por `tenant_id`
- `orders` → Filtradas por `tenant_id`
- `whatsapp_messages` → Filtradas por `tenant_id`
- `integration_whatsapp` → Filtradas por `tenant_id`
- `payment_integrations` → Filtradas por `tenant_id`
- `shipping_integrations` → Filtradas por `tenant_id`

### Tabelas Globais (Não Filtradas)
- `tenants` → Dados das empresas
- `profiles` → Perfis de usuários
- `app_settings` → Configurações globais

## 🛠️ Para Desenvolvedores

### Usando o Cliente Supabase
```typescript
import { supabaseTenant } from '@/lib/supabase-tenant';

// ✅ Automático: filtra por tenant atual
const { data } = await supabaseTenant.from('products').select('*');

// ✅ Manual: acesso global (para admins)
const { data } = await supabaseTenant.fromGlobal('tenants').select('*');

// ✅ Auth, Functions, Storage funcionam normalmente
const { data } = await supabaseTenant.auth.getUser();
```

### Detectar Tenant Atual
```typescript
import { useTenantContext } from '@/contexts/TenantContext';

function MeuComponente() {
  const { tenant, isMainSite, tenantId } = useTenantContext();
  
  if (isMainSite) {
    return <div>Site Principal - Área Admin</div>;
  }
  
  return <div>Site da empresa: {tenant?.name}</div>;
}
```

## 🎯 Benefícios

### Para as Empresas
- **Site próprio** com domínio personalizado
- **Dados completamente isolados** de outras empresas
- **Integrações independentes** (WhatsApp próprio, etc.)
- **Personalização futura** (cores, logo, etc.)

### Para o Administrador
- **Gestão centralizada** de todas as empresas
- **Escalabilidade** - adicionar novas empresas é simples
- **Segurança** - impossível uma empresa ver dados de outra
- **Facilidade** - URLs intuitivas e memoráveis

## ⚠️ Importante

1. **Desenvolvimento Local**: Use `localhost:3000` (funciona como site principal)
2. **Teste de Subdomínios**: Configure hosts locais ou use tunnel (ngrok)
3. **SSL**: O Lovable provê SSL automaticamente para todos os subdomínios
4. **Propagação DNS**: Pode levar até 48h para os DNS se propagarem completamente

## 📞 Exemplo Prático

**Cenário**: Empresa "Doces da Maria" 

1. Super admin cria empresa com slug: `doces-da-maria`
2. Site fica disponível em: `doces-da-maria.meusite.com` 
3. Maria acessa seu site e vê apenas:
   - Seus produtos (bolos, doces)
   - Seus clientes  
   - Suas vendas
   - Sua integração WhatsApp
4. Outras empresas nunca veem os dados da Maria

Perfeito para **franquias**, **revendedores**, **empresas de software B2B**, etc!
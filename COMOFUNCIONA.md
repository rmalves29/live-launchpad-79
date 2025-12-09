# 🎯 Como Funciona o OrderZap v2

## 🏗️ Sistema Multi-Tenant sem Subdomínio

### Conceito:

Ao invés de usar subdomínios (`loja1.orderzap.com`, `loja2.orderzap.com`), usamos **paths**:

```
https://orderzap.railway.app/tenant/loja1/dashboard
https://orderzap.railway.app/tenant/loja2/dashboard
https://orderzap.railway.app/tenant/minha-loja/pedidos
```

### Vantagens:

1. **Deploy Único** - Um único app no Railway
2. **Sem DNS** - Não precisa configurar subdomínios
3. **Compartilhamento Fácil** - Links diretos funcionam
4. **SEO Amigável** - Cada tenant tem URLs únicas

---

## 🔑 Sistema de Autenticação

### Fluxo Completo:

```
1. Usuário visita /auth/register
   ↓
2. Preenche:
   - Email
   - Senha
   - Nome da loja
   - Slug da loja (URL amigável: "minha-loja")
   ↓
3. Sistema cria:
   ✓ Usuário no Supabase Auth
   ✓ Tenant na tabela `tenants`
   ✓ Relação em `tenant_users` (role: owner)
   ↓
4. Redireciona para: /tenant/minha-loja/dashboard
```

### Segurança:

- **Middleware** verifica se usuário está autenticado
- **RLS (Row Level Security)** no Supabase garante isolamento de dados
- Cada query filtra automaticamente por `tenant_id`

---

## 📱 Sistema WhatsApp (Baileys)

### Por que Baileys?

- ✅ **100% Gratuito** (open source)
- ✅ **Multi-Device** (conecta via QR Code)
- ✅ **Sem Limitações** (envio ilimitado)
- ✅ **Estável** (usado em produção por milhares)

### Como Funciona:

```
1. Tenant acessa /tenant/minha-loja/whatsapp/conexao
   ↓
2. Sistema gera QR Code via Baileys
   ↓
3. Tenant escaneia QR com WhatsApp
   ↓
4. WhatsApp conecta e sessão fica salva
   ↓
5. Tenant pode enviar mensagens via:
   - /whatsapp/templates (mensagens prontas)
   - /whatsapp/cobranca (enviar cobranças)
   - API: POST /api/whatsapp/send
```

### Armazenamento de Sessão:

```
/whatsapp-sessions/
  ├── tenant-uuid-1/
  │   ├── creds.json
  │   └── keys.json
  ├── tenant-uuid-2/
  │   ├── creds.json
  │   └── keys.json
```

Cada tenant tem sua própria sessão isolada.

---

## 🗄️ Isolamento de Dados (Multi-Tenant)

### Como Garantimos Segurança:

#### 1. **Row Level Security (RLS)** no Supabase:

```sql
-- Exemplo: Tabela products
CREATE POLICY "Users can only see their tenant's products"
ON products
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can only insert into their tenant"
ON products
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);
```

#### 2. **Filtro Automático nas Queries:**

```typescript
// lib/utils/tenant.ts
export async function getTenantId(tenantSlug: string) {
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single()
  
  return data?.id
}

// Uso:
const tenantId = await getTenantId('minha-loja')
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('tenant_id', tenantId)  // ← Sempre filtra por tenant
```

#### 3. **Middleware de Autorização:**

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Rotas de tenant: /tenant/[slug]/...
  if (pathname.startsWith('/tenant/')) {
    const tenantSlug = pathname.split('/')[2]
    
    // Verificar se usuário tem acesso a este tenant
    const hasAccess = await userHasAccessToTenant(user.id, tenantSlug)
    
    if (!hasAccess) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }
  
  return NextResponse.next()
}
```

---

## 🎨 Interface do Usuário

### Layout do Tenant:

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Minha Loja              [User] [Notif] [Exit] │ ← Header
├─────────┬───────────────────────────────────────────────┤
│         │                                               │
│  🏠 Dash│  Dashboard Content                            │
│  📦 Ped │                                               │
│  🛍️ Prod│  [Cards, Gráficos, Tabelas]                  │
│  👥 Clie│                                               │
│  📱 What│                                               │
│  📊 Rela│                                               │
│  🏷️ Etiq│                                               │
│  ⚙️ Conf│                                               │
│         │                                               │
│ Sidebar │  Main Content Area                            │
└─────────┴───────────────────────────────────────────────┘
```

### Componentes Principais:

- **Header:** Logo, nome do tenant, troca de tenant, notificações, logout
- **Sidebar:** Navegação entre módulos
- **Main Content:** Conteúdo da página atual

---

## 🔄 Fluxo de Pedidos

### Criação de Pedido Manual:

```
1. /tenant/minha-loja/pedidos/manual
   ↓
2. Usuário preenche:
   - Cliente (busca ou cria novo)
   - Produtos (adiciona ao carrinho)
   - Forma de pagamento
   - Observações
   ↓
3. Sistema calcula:
   - Subtotal
   - Descontos
   - Frete (se configurado)
   - Total
   ↓
4. Ao salvar:
   - Cria pedido no banco
   - Gera número do pedido (auto incremento)
   - Atualiza estoque
   - (Opcional) Envia WhatsApp para cliente
   ↓
5. Redireciona para: /tenant/minha-loja/pedidos
```

### Pedidos Live (Tempo Real):

```
Cliente acessa: /tenant/minha-loja/checkout
→ Escolhe produtos
→ Preenche dados
→ Faz pedido

Sistema:
→ Cria pedido com status "pending"
→ Notifica tenant em tempo real
→ Tenant vê em /pedidos/live
→ Confirma ou rejeita
```

---

## 📊 Dashboard e Métricas

### Dados Mostrados:

```typescript
// Exemplo de query do dashboard
const metrics = {
  // Hoje
  ordersToday: await getOrdersCount(tenantId, 'today'),
  revenueToday: await getRevenue(tenantId, 'today'),
  
  // Este mês
  ordersMonth: await getOrdersCount(tenantId, 'month'),
  revenueMonth: await getRevenue(tenantId, 'month'),
  
  // Gráficos
  salesChart: await getSalesChart(tenantId, 30), // últimos 30 dias
  topProducts: await getTopProducts(tenantId, 10),
  
  // Status
  ordersByStatus: {
    pending: await getOrdersCount(tenantId, 'today', 'pending'),
    confirmed: await getOrdersCount(tenantId, 'today', 'confirmed'),
    shipped: await getOrdersCount(tenantId, 'today', 'shipped'),
  }
}
```

---

## 🚀 Deploy no Railway

### O que acontece:

```
1. git push origin main
   ↓
2. Railway detecta push
   ↓
3. Lê railway.toml
   → builder = "DOCKERFILE"
   ↓
4. Builda usando Dockerfile:
   → Stage 1: Instala dependências e builda Next.js
   → Stage 2: Copia build e prepara produção
   ↓
5. Roda: npm start
   ↓
6. Next.js inicia na porta $PORT (Railway define)
   ↓
7. App fica online em: https://seu-app.railway.app
```

### Variáveis Necessárias:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
```

---

## 🎯 Diferenças vs Sistema Atual

| Feature | v1 (Atual) | v2 (Novo) |
|---------|-----------|-----------|
| **Multi-tenant** | Subdomínios | Paths |
| **Deploy** | 2 serviços (frontend + backend) | 1 serviço |
| **Build time** | ~3-4 min | ~2 min |
| **SSR** | Não (SPA) | Sim |
| **API** | Express separado | Next.js API Routes |
| **Type Safety** | Parcial | 100% TypeScript |
| **WhatsApp** | Evolution API (pago após limite) | Baileys (100% grátis) |
| **Código** | Separado (frontend/backend) | Unificado |

---

## 📝 Próximos Passos para Completar

### Você pode continuar criando:

1. **Pages do Tenant:**
   - `app/tenant/[tenantSlug]/dashboard/page.tsx`
   - `app/tenant/[tenantSlug]/pedidos/page.tsx`
   - `app/tenant/[tenantSlug]/produtos/page.tsx`
   - etc.

2. **API Routes:**
   - `app/api/tenants/route.ts`
   - `app/api/orders/route.ts`
   - `app/api/whatsapp/connect/route.ts`
   - etc.

3. **Componentes UI:**
   - Copiar componentes do Shadcn UI
   - Criar componentes específicos do tenant

4. **Dockerfile:**
   - Ver próximo arquivo

---

**🎊 Sistema base está criado!**

Agora é só continuar implementando as páginas e API routes conforme o README.

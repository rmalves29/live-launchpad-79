# 🎯 Guia: Administração de Tenants (Empresas)

**Data:** 07/12/2024

---

## 🎉 NOVIDADES IMPLEMENTADAS

### 1. ✅ Painel de Administração de Empresas
- Criar, editar e bloquear tenants
- Definir prazo de acesso (trial)
- Gerenciar status de cada empresa
- Ver usuários por empresa

### 2. ✅ Controle de Acesso por Prazo
- Trial de 30 dias (configurável)
- Bloqueio automático quando expirar
- Bloqueio manual pelo admin
- Assinatura paga (para o futuro)

---

## 🚀 COMO USAR

### 1. Acessar Painel Admin

**Requisito:** Estar logado como super_admin (`rmalves21@hotmail.com`)

```
1. Faça login em: https://orderzaps.com/
2. No menu, clique em: "⚙️ Gerenciar Empresas"
3. Ou acesse diretamente: https://orderzaps.com/admin/tenants
```

### 2. Criar Nova Empresa

1. Clique em "**+ Nova Empresa**"
2. Preencha os dados:
   - **Nome da Empresa*** (obrigatório)
   - E-mail (opcional)
   - Nome do Responsável (opcional)
   - Telefone (opcional)
   - **Prazo de Acesso (dias)** (padrão: 30)
   - Plano: Trial, Basic, Pro, Enterprise
3. Configure:
   - ☑️ Empresa Ativa (padrão: SIM)
   - ☐ Bloquear Empresa (padrão: NÃO)
4. Clique em "**Criar Empresa**"

### 3. Editar Empresa

1. Na lista, clique no ícone ✏️ (Editar)
2. Modifique os dados necessários
3. Ajuste o prazo (dias)
4. Clique em "**Salvar Alterações**"

### 4. Bloquear/Desbloquear Empresa

1. Na lista, clique no ícone 🚫 (Bloquear) ou ✓ (Desbloquear)
2. Bloqueio manual impede acesso imediatamente
3. Adicione motivo do bloqueio (opcional)

---

## 📊 INFORMAÇÕES DA TABELA

### Colunas

| Coluna | Descrição |
|--------|-----------|
| **Empresa** | Nome e slug (URL) da empresa |
| **Contato** | Responsável, email e telefone |
| **Status** | Estado atual do acesso (ver abaixo) |
| **Plano** | Trial, Basic, Pro, Enterprise |
| **Prazo** | Dias restantes até expirar |
| **Usuários** | Quantos usuários tem essa empresa |
| **Ações** | Botões de editar e bloquear |

### Status Possíveis

| Badge | Significado | Cor |
|-------|-------------|-----|
| ✅ Ativo | Acesso liberado | Verde |
| 📅 Trial | Período de teste ativo | Azul |
| 💳 Pago | Assinatura ativa | Verde |
| ❌ Trial Expirado | Teste acabou | Vermelho |
| ❌ Assinatura Expirada | Pagamento venceu | Vermelho |
| 🚫 Bloqueado | Bloqueio manual | Vermelho |
| ⚪ Inativo | Empresa desativada | Cinza |

---

## 🗄️ ESTRUTURA NO BANCO DE DADOS

### Novos Campos na Tabela `tenants`

```sql
-- Controle de Prazo
trial_ends_at           -- Data de fim do trial (30 dias)
subscription_ends_at    -- Data de fim da assinatura paga
is_blocked              -- Bloqueio manual (true/false)
blocked_reason          -- Motivo do bloqueio
plan                    -- trial, basic, pro, enterprise

-- Limites
max_users               -- Máximo de usuários (padrão: 5)
max_products            -- Máximo de produtos (padrão: 100)
max_orders_per_month    -- Máximo de pedidos/mês (padrão: 1000)

-- Informações de Contato
contact_name            -- Nome do responsável
contact_phone           -- Telefone
company_document        -- CNPJ/CPF
notes                   -- Observações internas
```

### View `tenants_access_status`

Esta view calcula automaticamente:
- Status de acesso atual
- Dias restantes
- Total de usuários
- Se pode acessar ou não

---

## 🔧 COMO O CONTROLE FUNCIONA

### Fluxo de Acesso

```
1. Tenant tenta fazer login
   ↓
2. Sistema verifica tenant_has_access()
   ↓
3. Verifica:
   - is_active = true?
   - is_blocked = false?
   - trial_ends_at > hoje?
   - OU subscription_ends_at > hoje?
   ↓
4. Se TUDO OK → Libera acesso
   Se ALGUM problema → Bloqueia acesso
```

### Regras de Acesso

✅ **Libera acesso se:**
- Empresa está ativa (`is_active = true`)
- NÃO está bloqueada (`is_blocked = false`)
- Trial ainda não expirou (`trial_ends_at > now()`)
- OU tem assinatura válida (`subscription_ends_at > now()`)

❌ **Bloqueia acesso se:**
- Empresa inativa (`is_active = false`)
- Está bloqueada manualmente (`is_blocked = true`)
- Trial expirou E não tem assinatura
- Assinatura expirou

---

## 🧪 TESTES

### 1. Aplicar Migration no Supabase

```sql
-- Copie e cole o conteúdo de:
-- supabase/migrations/20251207_add_tenant_access_control.sql
-- No SQL Editor do Supabase
```

### 2. Verificar Tenants Atualizados

```sql
SELECT 
  name, 
  slug,
  trial_ends_at,
  plan,
  is_active,
  is_blocked
FROM tenants;
```

### 3. Testar Criação de Tenant

1. Acesse: https://orderzaps.com/admin/tenants
2. Crie uma empresa de teste:
   - Nome: "Loja Teste"
   - Prazo: 7 dias
   - Plano: Trial
3. Verifique se aparece na lista

### 4. Testar Bloqueio

1. Clique no botão 🚫 da empresa teste
2. Tente fazer login com usuário dessa empresa
3. Deve mostrar: "Acesso negado: Empresa bloqueada"

---

## 📱 ONDE ESTÁ O MENU?

### Para Super Admin (rmalves21@hotmail.com)

```
[Pedidos] [Produtos] [Clientes] [Pedidos] [SendFlow]
[Relatórios] [Sorteio] [Etiquetas] [Integrações]
[⚙️ Gerenciar Empresas] ← NOVO!
[WhatsApp ▼] [rmalves21@hotmail.com] [Sair]
```

### Para Tenants Normais

Menu "Gerenciar Empresas" **NÃO aparece**  
(apenas super_admin vê)

---

## 🔐 SEGURANÇA

### Controle de Acesso

✅ **Página /admin/tenants:**
- Protegida por `RequireAuth`
- Protegida por `SuperAdminOnly`
- Apenas `rmalves21@hotmail.com` ou `role = 'super_admin'` pode acessar

✅ **Função tenant_has_access():**
- Executa no banco de dados (SECURITY DEFINER)
- Impossível burlar pelo frontend
- Bloqueio em tempo real

---

## 💡 CASOS DE USO

### Caso 1: Cliente Novo (Trial 30 dias)

```
1. Admin cria empresa "Loja Nova"
2. Define: Prazo = 30 dias, Plano = Trial
3. Cria usuário para essa empresa
4. Cliente faz login e usa por 30 dias
5. No dia 31, sistema bloqueia automaticamente
6. Admin verifica e:
   - Opção A: Estende prazo (+30 dias)
   - Opção B: Converte para assinatura paga
```

### Caso 2: Cliente Inadimplente

```
1. Cliente não pagou
2. Admin bloqueia manualmente
3. Motivo: "Pagamento pendente"
4. Cliente tenta login → "Acesso bloqueado"
5. Cliente paga
6. Admin desbloqueia
7. Cliente volta a usar normalmente
```

### Caso 3: Estender Prazo

```
1. Cliente está com 2 dias restantes
2. Admin edita a empresa
3. Altera prazo para +30 dias
4. Sistema calcula: hoje + 30 dias
5. Cliente ganha mais 30 dias de acesso
```

---

## 🐛 TROUBLESHOOTING

### Problema: Menu "Gerenciar Empresas" não aparece

**Causa:** Você não é super_admin

**Solução:**
```sql
-- Verificar seu role
SELECT email, role FROM profiles WHERE email = 'seu-email@example.com';

-- Se não for super_admin, atualizar:
UPDATE profiles SET role = 'super_admin' WHERE email = 'rmalves21@hotmail.com';
```

### Problema: Erro ao criar tenant

**Causa:** Slug duplicado ou nome vazio

**Solução:**
- Nome é obrigatório
- Slug é gerado automaticamente
- Se slug já existe, tente nome diferente

### Problema: Trial não expira automaticamente

**Causa:** Função `tenant_has_access()` não está sendo chamada

**Solução:**
- Migration deve estar aplicada no Supabase
- Função deve existir no banco
- Verificar no SQL Editor:
```sql
SELECT tenant_has_access('uuid-do-tenant');
```

---

## 📈 PRÓXIMOS PASSOS (Futuro)

### Melhorias Planejadas

- [ ] Dashboard de estatísticas (total de tenants, expirados, etc)
- [ ] Notificações por email (3 dias antes de expirar)
- [ ] Histórico de alterações
- [ ] Exportar relatório de tenants
- [ ] Integração com gateway de pagamento
- [ ] Renovação automática de assinatura
- [ ] Portal do cliente (tenant gerencia própria assinatura)

---

## 📁 ARQUIVOS CRIADOS

1. ✅ `supabase/migrations/20251207_add_tenant_access_control.sql`
   - Adiciona campos de controle
   - Cria função tenant_has_access()
   - Cria view tenants_access_status

2. ✅ `frontend/src/pages/admin/TenantsAdmin.tsx`
   - Página de administração completa
   - CRUD de tenants
   - Bloqueio/desbloqueio
   - Formulário de edição

3. ✅ `frontend/src/App.tsx`
   - Rota /admin/tenants
   - Proteção SuperAdminOnly

4. ✅ `GUIA_ADMIN_TENANTS.md`
   - Este arquivo de documentação

---

## ✅ CHECKLIST

- [x] Migration criada
- [x] Página de admin criada
- [x] Rota protegida adicionada
- [x] Formulário de criação/edição
- [x] Bloqueio/desbloqueio
- [x] Controle de prazo
- [x] Documentação completa
- [ ] **Aplicar migration no Supabase**
- [ ] **Fazer deploy no Railway**
- [ ] **Testar em produção**

---

## 🎉 RESULTADO FINAL

✅ **Painel admin completo** para gerenciar empresas  
✅ **Controle de prazo** automático (trial 30 dias)  
✅ **Bloqueio manual** pelo administrador  
✅ **Status visual** de cada empresa  
✅ **Isolamento total** entre empresas  
✅ **Segurança** garantida (apenas super_admin)  

---

**Status:** ✅ **IMPLEMENTADO**  
**Commit:** Próximo  
**Data:** 07/12/2024

**Próximos passos:**
1. Aplicar migration no Supabase
2. Fazer deploy no Railway
3. Testar criação de empresa
4. Testar bloqueio de acesso

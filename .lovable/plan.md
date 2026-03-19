

## Plano: Página Pública de Cadastro Instagram + Telefone

### O que será criado

Uma página pública acessível por `/t/{slug}/cadastro-instagram` onde clientes podem vincular seu @ do Instagram ao telefone. Sem cabeçalho (navbar), com logo do tenant igual ao checkout. Um link copiável será adicionado na seção de configuração do Instagram em Integrações.

### Arquitetura

```text
/t/:slug/cadastro-instagram  (rota pública, sem navbar)
       │
       ▼
  Busca tenant por slug (mesmo padrão do PublicCheckout)
       │
       ▼
  Formulário: @instagram + telefone + nome
       │
       ▼
  Upsert na tabela `customers` (by instagram + tenant_id)
```

### Implementação

**1. Nova página `src/pages/tenant/CadastroInstagram.tsx`**
- Usa `useParams` para pegar o `slug`
- Busca tenant via `supabase.from('tenants').select(...)` (mesmo padrão do PublicCheckout)
- Exibe logo do tenant no topo (mesmo estilo do checkout: imagem centralizada com sombra)
- Formulário com campos: Instagram (@), Telefone, Nome
- Ao submeter: faz upsert na tabela `customers` usando `instagram` + `tenant_id` como chave. Se o cliente ja existe (mesmo instagram + tenant_id), atualiza o telefone e nome. Se nao existe, insere novo registro.
- Sem navbar, layout limpo e minimalista
- Validacao: Instagram obrigatorio (remove @ se digitado), telefone obrigatorio

**2. Rota em `src/App.tsx`**
- Adicionar rota `/t/:slug/cadastro-instagram` apontando para o novo componente
- Rota publica, sem RequireAuth/RequireTenantAuth

**3. RLS para insert publico**
- A tabela `customers` atualmente so permite INSERT para admins autenticados
- Criar uma nova policy de INSERT para `anon` role restrita ao cenario de cadastro publico
- Alternativa mais segura: usar uma Edge Function para o insert (service_role), evitando abrir a tabela para inserts anonimos

**4. Edge Function `instagram-register` (abordagem segura)**
- Recebe `{ tenantSlug, instagram, phone, name }`
- Valida inputs, busca tenant_id pelo slug
- Faz upsert em `customers` usando service_role
- Retorna sucesso/erro

**5. Link copiavel em `InstagramIntegration.tsx`**
- Na seção de configuração (quando conectado), adicionar um novo Card abaixo do Webhook URL
- Titulo: "Link de Cadastro de Clientes"
- Mostra URL: `{window.location.origin}/t/{tenantSlug}/cadastro-instagram`
- Botao de copiar (mesmo padrao do webhook URL)

### Arquivos afetados
- **Novo**: `src/pages/tenant/CadastroInstagram.tsx`
- **Novo**: `supabase/functions/instagram-register/index.ts`
- **Editar**: `src/App.tsx` (adicionar rota)
- **Editar**: `src/components/integrations/InstagramIntegration.tsx` (adicionar link copiavel)


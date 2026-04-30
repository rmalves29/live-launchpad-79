## Problema

Ao fazer login no OrderZap, o sistema fica preso em "carregando" infinito e não entra na tela principal. Isso afeta todos os clientes (não só Mania de Mulher).

## Causa raiz

Existem **flags globais em nível de módulo** (variáveis fora do componente) que “lembram” entre sessões/abas se o app já carregou alguma vez:

- `hasInitiallyLoaded` em `RequireTenantAuth.tsx`
- `hasEverLoaded` em `TenantLoader.tsx`
- `profileCache` em `useAuth.tsx`

Quando o usuário faz logout e tenta logar de novo (ou abre uma aba nova após uma sessão anterior corrompida), essas flags ficam num estado inconsistente: o `RequireTenantAuth` pensa que já carregou e libera a renderização antes do `tenant`/`profile` estarem prontos — mas como `tenant` ainda é `null`, fica num limbo. Em outros casos, o spinner de `checkingSubscription` nunca é resolvido porque a verificação trava sem timeout.

Também há concorrência: `Auth.tsx` faz sua própria verificação de profile/tenant após o login, enquanto `useAuth` + `TenantContext` fazem a deles em paralelo, gerando race conditions.

## O que vou ajustar

### 1. `src/hooks/useAuth.tsx`
- Tratar evento `INITIAL_SESSION` (hoje é ignorado, fazendo o `isLoading` nunca virar `false` em alguns cenários).
- Garantir que `setIsLoading(false)` sempre seja chamado, mesmo em erros silenciosos.
- Manter o `profileCache`, mas invalidá-lo corretamente ao trocar de usuário.

### 2. `src/components/RequireTenantAuth.tsx`
- Remover a flag global `hasInitiallyLoaded` (mover para `useState` local do componente).
- Adicionar **timeout de 3 segundos** na verificação de assinatura (se não responder, libera o acesso em vez de travar — fail-open).
- Simplificar a lógica de “primeira renderização” para não depender de estado entre montagens.

### 3. `src/components/TenantLoader.tsx`
- Remover a flag global `hasEverLoaded` — o componente já não bloqueia nada (só seta o tenant no cliente Supabase), então a flag é desnecessária e prejudicial.

### 4. `src/pages/Auth.tsx`
- Remover a verificação duplicada de profile/tenant feita no `handleLogin` (já é feita pelo `RequireTenantAuth` após a navegação).
- Manter apenas a verificação de assinatura expirada para redirecionar ao `/renovar-assinatura`.
- Isso elimina a race condition entre `Auth.tsx` e o `RequireTenantAuth`.

### 5. Diagnóstico temporário
- Adicionar logs `[LOGIN-DIAG]` em pontos-chave (estados de `authLoading`, `tenantLoading`, `checkingSubscription`, `subscriptionExpired`) para confirmar a correção em produção. Removidos depois que o usuário validar.

## Resultado esperado

- Login funciona em qualquer cenário (primeira vez, após logout, aba nova, sessão antiga).
- Nenhum spinner infinito, mesmo se a verificação de assinatura demorar.
- Sem race condition entre Auth e RequireTenantAuth.

## Arquivos alterados
- `src/hooks/useAuth.tsx`
- `src/components/RequireTenantAuth.tsx`
- `src/components/TenantLoader.tsx`
- `src/pages/Auth.tsx`

> ⚠️ Documento antigo: pode citar a arquitetura legada (OrderZap v2, Node/Express, Next.js). A lógica atual está nas Edge Functions em `supabase/functions/`. Veja o README da raiz.

# 📦 Como Configurar o Bling ERP no OrderZap

**Guia passo a passo para integrar seu sistema de gestão com o OrderZap**

---

## 📖 O que é o Bling ERP?

O **Bling** é um sistema de gestão empresarial (ERP) brasileiro que ajuda você a:
- ✅ Gerenciar pedidos de vendas
- ✅ Controlar estoque
- ✅ Emitir notas fiscais
- ✅ Integrar com marketplaces (Mercado Livre, Shopee, etc.)
- ✅ Gerenciar transportadoras e fretes

Ao integrar o Bling ao OrderZap, seus pedidos serão **sincronizados automaticamente**, facilitando a gestão e emissão de notas fiscais.

---

## 📋 O que você vai precisar

Antes de começar, tenha em mãos:

| Item | Descrição |
|------|-----------|
| 📧 Conta Bling | Uma conta ativa no Bling ERP |
| 💼 Plano Bling | Plano que suporte integrações via API |
| 🔐 Acesso ao Portal | Acesso ao Portal de Desenvolvedores do Bling |

> ⏱️ **Tempo estimado**: 15-20 minutos para configuração completa

---

## 🚀 PARTE 1: Criar sua conta no Bling (se ainda não tiver)

### Passo 1.1 - Acessar o site

1. Abra seu navegador (Chrome, Firefox, Edge, etc.)
2. Digite na barra de endereço: **bling.com.br**
3. Pressione **Enter**

### Passo 1.2 - Criar conta ou fazer login

1. Se ainda não tem conta, clique em **"Teste grátis"**
2. Se já tem conta, clique em **"Entrar"**

### Passo 1.3 - Verificar seu plano

Para usar a integração com API, você precisa de um plano que suporte essa funcionalidade.

1. No Bling, vá em **Configurações > Minha Conta > Plano**
2. Verifique se seu plano inclui "Integrações via API"

> 💡 **Dica**: Se não tiver certeza, entre em contato com o suporte do Bling

---

## 🔑 PARTE 2: Criar um Aplicativo no Portal de Desenvolvedores

Esta é a etapa mais importante! Você vai criar um "aplicativo" no Bling que permitirá a comunicação com o OrderZap.

### Passo 2.1 - Acessar o Portal de Desenvolvedores

1. Abra uma nova aba no navegador
2. Acesse: **developer.bling.com.br**
3. Clique em **"Entrar"** (use as mesmas credenciais do Bling)

Você verá o painel de desenvolvedores do Bling.

### Passo 2.2 - Criar um novo aplicativo

1. No menu, clique em **"Aplicativos"**
2. Clique no botão **"+ Criar aplicativo"**

Você verá um formulário para preencher:

```
┌─────────────────────────────────────────────────────────────┐
│  🆕 Criar Novo Aplicativo                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Nome do Aplicativo *                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │ OrderZap                                    │            │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  Descrição                                                  │
│  ┌─────────────────────────────────────────────┐            │
│  │ Integração com sistema OrderZap             │            │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  URL de Callback *                                          │
│  ┌─────────────────────────────────────────────┐            │
│  │ (veja abaixo)                               │            │
│  └─────────────────────────────────────────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 2.3 - Preencher os dados do aplicativo

**Campo: Nome do Aplicativo**
```
OrderZap
```

**Campo: Descrição** (opcional)
```
Integração para sincronização de pedidos com OrderZap
```

**Campo: URL de Callback** ⚠️ MUITO IMPORTANTE
```
https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth-callback
```

> ⚠️ **ATENÇÃO**: Copie esta URL **EXATAMENTE** como está acima. Qualquer letra errada e a integração não vai funcionar!

### Passo 2.4 - Selecionar os Escopos (Permissões)

O Bling vai perguntar quais permissões o aplicativo precisa. Marque **TODAS** as opções abaixo:

**Escopos obrigatórios:**
- ✅ `pedidos.read` - Ler pedidos
- ✅ `pedidos.write` - Criar/editar pedidos
- ✅ `produtos.read` - Ler produtos
- ✅ `produtos.write` - Criar/editar produtos
- ✅ `contatos.read` - Ler contatos (clientes)
- ✅ `contatos.write` - Criar/editar contatos
- ✅ `estoques.read` - Ler estoque
- ✅ `estoques.write` - Editar estoque

**Escopos opcionais (se for usar):**
- ☐ `nfes.read` - Ler notas fiscais
- ☐ `nfes.write` - Emitir notas fiscais
- ☐ `logisticas.read` - Ler logística
- ☐ `logisticas.write` - Editar logística

> 💡 **Dica**: Na dúvida, marque todos os escopos disponíveis. É melhor ter permissão de sobra do que faltar!

### Passo 2.5 - Salvar o aplicativo

1. Clique em **"Salvar"** ou **"Criar Aplicativo"**
2. O Bling vai gerar as credenciais do seu aplicativo

### Passo 2.6 - Copiar as credenciais

Após salvar, você verá uma tela com suas credenciais:

```
┌─────────────────────────────────────────────────────────────┐
│  🔐 Credenciais do Aplicativo                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client ID:                                                 │
│  ┌─────────────────────────────────────────────┐            │
│  │ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx            │  [Copiar]  │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  Client Secret:                                             │
│  ┌─────────────────────────────────────────────┐            │
│  │ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx            │  [Copiar]  │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  ⚠️ Guarde o Client Secret em local seguro!                 │
│  Ele só será exibido uma vez.                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**MUITO IMPORTANTE:**

1. **Client ID**: Clique em **[Copiar]** e cole em um bloco de notas
2. **Client Secret**: Clique em **[Copiar]** e cole também no bloco de notas

> 🔒 **ATENÇÃO**: O **Client Secret** só aparece UMA VEZ! Se você perder, terá que criar um novo aplicativo.

---

## ⚙️ PARTE 3: Configurar no OrderZap

Agora vamos colocar as credenciais no OrderZap.

### Passo 3.1 - Acessar as Integrações

1. No OrderZap, clique em **"Configurações"** no menu superior
2. Clique na aba **"Integrações"**
3. Localize o card **"Bling ERP"** e clique nele

### Passo 3.2 - Preencher as credenciais

Você verá um formulário assim:

```
┌─────────────────────────────────────────────────────────────┐
│  📦 Integração Bling ERP                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Credenciais da API ──────────────────────────────────┐  │
│  │                                                       │  │
│  │  Client ID *                                          │  │
│  │  ┌─────────────────────────────────────────────┐      │  │
│  │  │                                             │      │  │
│  │  └─────────────────────────────────────────────┘      │  │
│  │  Obtido no Portal de Desenvolvedores do Bling        │  │
│  │                                                       │  │
│  │  Client Secret *                                      │  │
│  │  ┌─────────────────────────────────────────────┐      │  │
│  │  │                                             │      │  │
│  │  └─────────────────────────────────────────────┘      │  │
│  │  Obtido no Portal de Desenvolvedores do Bling        │  │
│  │                                                       │  │
│  │  [    Salvar Credenciais    ]                         │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Preencha assim:**

| Campo | O que fazer |
|-------|-------------|
| **Client ID** | Cole o Client ID que você copiou do Bling |
| **Client Secret** | Cole o Client Secret que você copiou do Bling |

### Passo 3.3 - Salvar as credenciais

1. Clique no botão **"Salvar Credenciais"**
2. Aguarde a mensagem de confirmação: **"Credenciais salvas com sucesso!"**

---

## 🔓 PARTE 4: Autorizar a Integração

Depois de salvar as credenciais, você precisa **autorizar** o OrderZap a acessar sua conta Bling.

### Passo 4.1 - Clicar no botão de autorização

Na mesma tela de integrações, você verá um botão:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Status: 🟠 Aguardando Autorização                          │
│                                                             │
│  [    🔐 Autorizar Bling ERP    ]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

1. Clique no botão **"Autorizar Bling ERP"**
2. Você será redirecionado para o site do Bling

### Passo 4.2 - Autorizar no Bling

Você verá uma tela do Bling pedindo sua autorização:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔐 Autorizar Aplicativo                                    │
│                                                             │
│  O aplicativo "OrderZap" está solicitando acesso à sua      │
│  conta Bling com as seguintes permissões:                   │
│                                                             │
│  ✓ Ler e criar pedidos                                      │
│  ✓ Ler e criar produtos                                     │
│  ✓ Ler e criar contatos                                     │
│  ✓ Ler e editar estoque                                     │
│                                                             │
│  [  Cancelar  ]              [  ✓ Autorizar  ]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

1. **Verifique** se o nome do aplicativo é "OrderZap"
2. Clique em **"Autorizar"**

### Passo 4.3 - Confirmar a autorização

Após autorizar, você será redirecionado de volta ao OrderZap e verá:

```
✅ Bling ERP autorizado com sucesso!
```

O status agora mostrará:

```
Status: 🟢 Autorizado
```

---

## 🏪 PARTE 5: Selecionar a Loja/Canal de Venda

Esta etapa é **MUITO IMPORTANTE**! Você precisa escolher em qual loja/canal os pedidos serão criados no Bling.

### Passo 5.1 - Localizar o seletor de loja

Na seção de integração Bling, procure por:

```
┌─────────────────────────────────────────────────────────────┐
│  🏪 Loja/Canal de Venda                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selecione onde os pedidos devem aparecer no Bling:         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ▼ Selecione uma loja...                             │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │   📦 Loja Virtual - API (ID: 12345)                 │    │
│  │   🛒 Mercado Livre (ID: 67890)                      │    │
│  │   🛍️ Shopee (ID: 11111)                             │    │
│  │   🏬 Loja Física (ID: 22222)                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 5.2 - Escolher a loja correta

1. Clique no seletor para ver as lojas disponíveis
2. Escolha a loja onde os pedidos do OrderZap devem aparecer
3. Geralmente será algo como **"Loja Virtual - API"** ou **"E-commerce"**

> 💡 **Dica**: Se você criou uma loja específica no Bling para o OrderZap, selecione-a aqui.

### Passo 5.3 - Salvar a seleção

1. Após escolher a loja, clique em **"Salvar"**
2. Agora os pedidos sincronizados aparecerão nesta loja

> ⚠️ **IMPORTANTE**: Se você não selecionar uma loja, os pedidos podem não aparecer corretamente no Bling ou ficar em um local genérico.

---

## ⚡ PARTE 6: Ativar os Módulos de Sincronização

Agora você pode escolher o que deseja sincronizar entre o OrderZap e o Bling.

### Passo 6.1 - Ver os módulos disponíveis

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Módulos de Sincronização                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🛒 Gestão de Pedidos                    [ ON  / OFF ]      │
│     Sincronizar pedidos automaticamente                     │
│                                                             │
│  📦 Produtos                             [ ON  / OFF ]      │
│     Sincronizar catálogo de produtos                        │
│                                                             │
│  📊 Controle de Estoque                  [ ON  / OFF ]      │
│     Sincronizar estoque em tempo real                       │
│                                                             │
│  📄 Notas Fiscais                        [ ON  / OFF ]      │
│     Emissão de NF-e e NFC-e                                 │
│                                                             │
│  🏪 Marketplaces                         [ ON  / OFF ]      │
│     Integração com Shopee, ML, Amazon...                    │
│                                                             │
│  🌐 E-commerces                          [ ON  / OFF ]      │
│     Integração com Tray, Shopify, Nuvemshop...              │
│                                                             │
│  🚚 Logística                            [ ON  / OFF ]      │
│     Integração com transportadoras                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 6.2 - Ativar os módulos desejados

Para a maioria dos usuários, recomendamos ativar:

| Módulo | Recomendação | Descrição |
|--------|--------------|-----------|
| **Gestão de Pedidos** | ✅ Ativar | Envia pedidos pagos para o Bling |
| **Produtos** | ✅ Ativar | Exporta produtos para o Bling |
| **Controle de Estoque** | Opcional | Sincroniza quantidades |
| **Notas Fiscais** | Opcional | Se você emite NF pelo Bling |
| **Marketplaces** | Opcional | Se usa marketplaces |
| **E-commerces** | Opcional | Se usa outras plataformas |
| **Logística** | ✅ Ativar | Se usa frete integrado |

### Passo 6.3 - Salvar configurações

1. Ative os módulos desejados (clique nos switches)
2. Clique em **"Salvar Configurações"**

---

## 📤 PARTE 7: Sincronizar Pedidos

Com tudo configurado, seus pedidos serão sincronizados automaticamente! Mas você também pode fazer manualmente.

### Passo 7.1 - Sincronização automática

Quando um pedido é **marcado como pago** no OrderZap, ele é automaticamente enviado para o Bling.

O processo é assim:
```
Cliente paga → OrderZap marca como pago → Pedido vai para o Bling
```

### Passo 7.2 - Sincronização manual (em lote)

Se você tem pedidos antigos que ainda não foram enviados:

1. Na seção do Bling, procure por **"Sincronização de Pedidos"**
2. Você verá quantos pedidos estão pendentes
3. Clique em **"Exportar para Bling"**

```
┌─────────────────────────────────────────────────────────────┐
│  📤 Sincronização de Pedidos                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pedidos pendentes: 15                                      │
│  Pedidos sincronizados: 342                                 │
│                                                             │
│  [    📤 Exportar 15 Pedidos para Bling    ]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 7.3 - Verificar no Bling

1. Acesse seu painel do Bling
2. Vá em **Vendas > Pedidos de Venda**
3. Filtre pela loja que você configurou
4. Os pedidos do OrderZap devem aparecer lá!

---

## 📦 PARTE 8: Sincronizar Produtos (Opcional)

Você também pode enviar seus produtos do OrderZap para o Bling.

### Passo 8.1 - Localizar painel de produtos

Na seção do Bling, procure por **"Sincronização de Produtos"**:

```
┌─────────────────────────────────────────────────────────────┐
│  📦 Sincronização de Produtos                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Produtos pendentes: 45                                     │
│  Produtos sincronizados: 120                                │
│                                                             │
│  [    📦 Exportar 45 Produtos para Bling    ]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 8.2 - Exportar produtos

1. Clique em **"Exportar Produtos para Bling"**
2. Aguarde a sincronização (pode demorar alguns minutos)
3. Os produtos aparecerão no seu cadastro do Bling

---

## ❓ Problemas Comuns e Soluções

### ❌ "Erro de autorização" ou "Token inválido"

**Possíveis causas:**
- Client ID ou Client Secret incorreto
- URL de callback errada no aplicativo do Bling

**Como resolver:**
1. Verifique se copiou as credenciais corretamente (sem espaços)
2. No Portal de Desenvolvedores do Bling, confirme que a URL de callback é:
   ```
   https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth-callback
   ```
3. Se necessário, crie um novo aplicativo no Bling

---

### ❌ "Pedido não aparece no Bling"

**Possíveis causas:**
- Loja/Canal de venda não selecionado
- Módulo de pedidos não está ativado
- Pedido não foi marcado como pago

**Como resolver:**
1. Verifique se selecionou uma loja na configuração
2. Confirme que o switch "Gestão de Pedidos" está ativado
3. Verifique se o pedido está marcado como **pago** no OrderZap

---

### ❌ "Token expirado"

**O que acontece:**
O Bling usa tokens que expiram periodicamente. O sistema renova automaticamente, mas às vezes falha.

**Como resolver:**
1. Clique no botão **"Renovar Token"** na seção Bling
2. Se não funcionar, clique em **"Autorizar Bling ERP"** novamente
3. Siga o processo de autorização novamente

---

### ❌ "Erro de escopo" ou "Permissão negada"

**Causa:**
O aplicativo no Bling não tem as permissões necessárias.

**Como resolver:**
1. Acesse **developer.bling.com.br**
2. Edite seu aplicativo
3. Adicione os escopos que estão faltando:
   - `pedidos.read` e `pedidos.write`
   - `produtos.read` e `produtos.write`
   - `contatos.read` e `contatos.write`
4. Salve e autorize novamente no OrderZap

---

### ❌ "Cliente não encontrado no Bling"

**O que acontece:**
Ao sincronizar pedidos, o sistema precisa encontrar ou criar o cliente no Bling.

**Como resolver:**
- Isso é normal! O sistema cria automaticamente o cliente se não existir
- Certifique-se de que os dados do cliente estão completos (nome, telefone, endereço)
- O campo **bairro** é obrigatório para gerar etiquetas de frete

---

## 📊 Verificar se está funcionando

### Checklist de verificação:

1. **Status de autorização:**
   - [ ] O badge mostra "🟢 Autorizado"
   
2. **Loja configurada:**
   - [ ] Uma loja/canal está selecionada
   
3. **Módulos ativos:**
   - [ ] "Gestão de Pedidos" está ativado
   
4. **Teste prático:**
   - [ ] Crie um pedido de teste
   - [ ] Marque como pago
   - [ ] Verifique se aparece no Bling em alguns segundos

---

## 📞 Precisa de Ajuda?

### Suporte Bling
- 📧 Email: suporte@bling.com.br
- 📚 Documentação: [ajuda.bling.com.br](https://ajuda.bling.com.br)
- 💬 Chat: Disponível no painel do Bling

### Suporte OrderZap
- Entre em contato com o administrador do sistema

---

## ✅ Checklist Final

Antes de começar a usar, confirme:

- [ ] Conta no Bling criada e ativa
- [ ] Aplicativo criado no Portal de Desenvolvedores
- [ ] URL de callback configurada corretamente
- [ ] Escopos/permissões adicionados
- [ ] Client ID copiado e salvo no OrderZap
- [ ] Client Secret copiado e salvo no OrderZap
- [ ] Autorização realizada com sucesso (status verde)
- [ ] Loja/Canal de venda selecionado
- [ ] Módulo "Gestão de Pedidos" ativado
- [ ] Teste de sincronização realizado

---

**🎉 Parabéns! Sua integração está configurada!**

Agora seus pedidos pagos serão automaticamente enviados para o Bling ERP, facilitando sua gestão e emissão de notas fiscais.

---

## 📚 Referência Rápida

| Ação | Onde fazer |
|------|------------|
| Criar aplicativo | [developer.bling.com.br](https://developer.bling.com.br) |
| Configurar credenciais | OrderZap > Configurações > Integrações > Bling |
| Autorizar integração | Botão "Autorizar Bling ERP" |
| Selecionar loja | Dropdown "Loja/Canal de Venda" |
| Sincronizar pedidos | Botão "Exportar para Bling" |
| Verificar pedidos | Bling > Vendas > Pedidos de Venda |

---

*Última atualização: Janeiro 2026*

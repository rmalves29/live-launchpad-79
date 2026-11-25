> ⚠️ Documento antigo: pode citar a arquitetura legada (OrderZap v2, Node/Express, Next.js). A lógica atual está nas Edge Functions em `supabase/functions/`. Veja o README da raiz.

# 📦 Guia Completo de Integração com o Melhor Envio

Este guia vai te ensinar passo a passo como configurar a integração com o **Melhor Envio** para calcular fretes, gerar etiquetas e rastrear envios automaticamente.

---

## 📋 Índice

1. [O que você vai precisar](#1-o-que-você-vai-precisar)
2. [Criando sua conta no Melhor Envio](#2-criando-sua-conta-no-melhor-envio)
3. [Gerando o Token de Acesso](#3-gerando-o-token-de-acesso)
4. [Configurando no OrderZap](#4-configurando-no-orderzap)
5. [Configurando o Webhook (Opcional)](#5-configurando-o-webhook-opcional)
6. [Testando a Integração](#6-testando-a-integração)
7. [Como Funciona no Dia a Dia](#7-como-funciona-no-dia-a-dia)
8. [Perguntas Frequentes](#8-perguntas-frequentes)
9. [Resolução de Problemas](#9-resolução-de-problemas)

---

## 1. O que você vai precisar

Antes de começar, tenha em mãos:

| Item | Descrição |
|------|-----------|
| ✅ Conta no Melhor Envio | Cadastro gratuito em melhorenvio.com.br |
| ✅ Dados da empresa | CNPJ, endereço completo |
| ✅ CEP de origem | CEP de onde você envia os produtos |
| ✅ Saldo na carteira | Para comprar etiquetas (pode começar com R$ 20,00) |

---

## 2. Criando sua conta no Melhor Envio

### Passo 2.1 - Acessar o site

1. Acesse **[https://melhorenvio.com.br](https://melhorenvio.com.br)**
2. Clique em **"Criar conta grátis"** no canto superior direito

![Tela inicial do Melhor Envio](https://melhorenvio.com.br - ilustrativo)

### Passo 2.2 - Preencher o cadastro

1. Escolha **"Sou lojista"** (importante!)
2. Preencha seus dados:
   - Nome completo
   - E-mail válido
   - Senha forte
   - Telefone

3. Clique em **"Criar conta"**

### Passo 2.3 - Verificar o e-mail

1. Acesse sua caixa de entrada
2. Procure o e-mail do Melhor Envio
3. Clique no link de confirmação

### Passo 2.4 - Completar o cadastro da empresa

Após o login, você precisará completar os dados:

1. **Dados pessoais**: CPF, data de nascimento
2. **Dados da empresa**: 
   - CNPJ (obrigatório para emitir NF)
   - Razão Social
   - Nome Fantasia

3. **Endereço de coleta** (de onde saem os produtos):
   - CEP
   - Rua, número, bairro
   - Cidade, Estado
   - Complemento (se houver)

> ⚠️ **IMPORTANTE**: O endereço de coleta deve ser exatamente igual ao que você vai usar no OrderZap!

### Passo 2.5 - Adicionar saldo na carteira

1. No painel do Melhor Envio, vá em **"Carteira"**
2. Clique em **"Adicionar saldo"**
3. Escolha o valor (mínimo R$ 20,00)
4. Escolha a forma de pagamento:
   - PIX (mais rápido)
   - Boleto
   - Cartão de crédito

> 💡 **DICA**: Comece com um valor pequeno para testar. Depois você pode adicionar mais conforme a demanda.

---

## 3. Gerando o Token de Acesso

O Token é como uma "senha especial" que permite o OrderZap se comunicar com o Melhor Envio.

### Passo 3.1 - Acessar a área de Integrações

1. No painel do Melhor Envio, clique no seu **nome/foto** no canto superior direito
2. Clique em **"Configurações"**
3. No menu lateral, clique em **"Integrações"**

```
Caminho: Menu > Configurações > Integrações
```

### Passo 3.2 - Gerar novo Token

1. Na seção **"Tokens de acesso"**, clique em **"Gerar novo token"**

2. Preencha as informações:
   - **Nome do token**: `OrderZap` (ou qualquer nome para identificar)
   - **Permissões**: Marque **TODAS** as opções:
     - ☑️ Cotação de fretes
     - ☑️ Carrinho de compras
     - ☑️ Etiquetas
     - ☑️ Rastreamento
     - ☑️ Cancelamento

3. Clique em **"Gerar token"**

### Passo 3.3 - Copiar o Token

> ⚠️ **ATENÇÃO MÁXIMA**: O token só aparece UMA vez! Copie e guarde em lugar seguro!

1. O token será exibido na tela
2. Clique no ícone de **copiar** 📋
3. Cole em um bloco de notas temporariamente

**Formato do token** (exemplo):
```
eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5NTYiLCJqdGkiO...
```

> O token é uma sequência longa de letras e números. Se você perder, terá que gerar outro.

---

## 4. Configurando no OrderZap

Agora vamos configurar o token no sistema.

### Passo 4.1 - Acessar Configurações

1. No OrderZap, vá em **Configurações** (menu lateral)
2. Clique na aba **"Integrações"**
3. Localize a seção **"Melhor Envio"**

### Passo 4.2 - Preencher os dados

| Campo | O que preencher |
|-------|-----------------|
| **Token de Acesso** | Cole o token que você copiou |
| **CEP de Origem** | CEP de onde você envia (ex: 01310-100) |
| **Modo Sandbox** | ❌ Desligado para produção |

### Passo 4.3 - Ativar a integração

1. Ative o **switch** no topo do card do Melhor Envio
2. Clique em **"Salvar"**

> 💡 **NOTA**: Ao ativar o Melhor Envio, outras integrações de frete (como Mandae) serão automaticamente desativadas.

### Passo 4.4 - Verificar conexão

Após salvar, o sistema vai verificar se o token está válido:

- ✅ **Verde**: Conexão OK
- ❌ **Vermelho**: Token inválido ou expirado

---

## 5. Configurando o Webhook (Opcional)

O webhook permite que o Melhor Envio avise automaticamente o OrderZap quando uma etiqueta for gerada ou quando houver atualização de rastreio.

### O que é um Webhook?

É como um "telefone" que o Melhor Envio usa para avisar o OrderZap sobre novidades. Sem ele, você precisa clicar em "Sincronizar" manualmente.

### Passo 5.1 - Copiar a URL do Webhook

A URL do webhook do OrderZap é:

```
https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/melhor-envio-webhook
```

### Passo 5.2 - Configurar no Melhor Envio

1. No Melhor Envio, vá em **Configurações > Integrações**
2. Na seção **"Webhooks"**, clique em **"Configurar"**
3. Cole a URL acima
4. Marque os eventos:
   - ☑️ `order.posted` (quando etiqueta é gerada)
   - ☑️ `order.tracking` (atualização de rastreio)

5. Clique em **"Salvar"**

### Benefícios do Webhook

| Com Webhook | Sem Webhook |
|-------------|-------------|
| Rastreio atualiza automaticamente | Precisa clicar em "Sincronizar" |
| Cliente recebe WhatsApp na hora | Pode haver atraso nas notificações |
| Menos trabalho manual | Precisa verificar periodicamente |

---

## 6. Testando a Integração

Vamos verificar se tudo está funcionando.

### Teste 1: Cotação de Frete

1. Vá em **Pedidos** e crie um pedido de teste
2. Adicione um CEP de destino válido
3. Clique em **"Calcular Frete"**

**Resultado esperado**: Lista de opções de frete com preços e prazos

```
📦 PAC - R$ 25,90 (8 dias úteis)
📦 SEDEX - R$ 45,50 (3 dias úteis)
📦 Mini Envios - R$ 12,00 (10 dias úteis)
```

### Teste 2: Gerar Etiqueta

1. Vá em **Etiquetas** no menu lateral
2. Selecione um pedido pago
3. Escolha o serviço de frete
4. Clique em **"Criar Remessa"**
5. Clique em **"Comprar Frete"**
6. Clique em **"Imprimir Etiqueta"**

**Resultado esperado**: PDF da etiqueta abre para impressão

### Teste 3: Rastreamento

1. Após gerar a etiqueta, aguarde alguns minutos
2. O código de rastreio deve aparecer no pedido
3. O cliente receberá WhatsApp automático (se Z-API estiver configurado)

---

## 7. Como Funciona no Dia a Dia

### Fluxo Completo de Envio

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUXO DE ENVIO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PEDIDO PAGO                                                │
│     ↓                                                          │
│  2. IR EM "ETIQUETAS"                                          │
│     ↓                                                          │
│  3. SELECIONAR PEDIDO                                          │
│     ↓                                                          │
│  4. ESCOLHER TRANSPORTADORA (PAC, SEDEX, etc.)                │
│     ↓                                                          │
│  5. CRIAR REMESSA                                              │
│     ↓                                                          │
│  6. COMPRAR FRETE (desconta da carteira ME)                   │
│     ↓                                                          │
│  7. IMPRIMIR ETIQUETA                                          │
│     ↓                                                          │
│  8. COLAR NO PACOTE E POSTAR                                  │
│     ↓                                                          │
│  9. CLIENTE RECEBE WHATSAPP COM RASTREIO 📱                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Onde acompanhar os pedidos

| Local | O que mostra |
|-------|--------------|
| **Etiquetas** | Pedidos pendentes de envio |
| **Pedidos** | Status completo (pago, enviado, entregue) |
| **Melhor Envio** | Todas as etiquetas e rastreios |

### Sincronização Automática

O sistema sincroniza automaticamente os códigos de rastreio:

- **Horário**: Todos os dias às 20h (horário de Brasília)
- **O que faz**: Busca códigos de rastreio de etiquetas geradas
- **Resultado**: Atualiza pedidos e envia WhatsApp para clientes

> 💡 Você também pode clicar em "Sincronizar Rastreios" na página de Etiquetas para forçar a atualização.

---

## 8. Perguntas Frequentes

### ❓ Quanto custa usar o Melhor Envio?

O Melhor Envio é **gratuito** para usar. Você paga apenas o frete das transportadoras, que costuma ser mais barato que enviar direto.

**Economia média**: 20% a 40% comparado ao balcão dos Correios.

### ❓ Quais transportadoras estão disponíveis?

| Transportadora | Serviços |
|----------------|----------|
| **Correios** | PAC, SEDEX, Mini Envios |
| **Jadlog** | .Package, .Com |
| **Azul Cargo** | Amanhã, E-commerce |
| **Latam Cargo** | Próximo dia |
| **Buslog** | Rodoviário |

> A disponibilidade depende do CEP de origem e destino.

### ❓ Como funciona a coleta?

Você tem duas opções:

1. **Postar na agência**: Leve o pacote em uma agência dos Correios ou ponto parceiro
2. **Solicitar coleta**: Pague uma taxa e o motoboy busca na sua casa

### ❓ O rastreio atualiza sozinho?

**Sim!** De duas formas:

1. **Webhook**: Atualiza instantaneamente quando há novidade
2. **Sincronização automática**: Roda todos os dias às 20h

### ❓ E se o cliente não receber o WhatsApp?

Verifique:
1. Se o Z-API está conectado
2. Se o telefone do cliente está correto
3. Se a integração WhatsApp está ativa

### ❓ Posso cancelar uma etiqueta?

**Sim**, mas com regras:

| Situação | Pode cancelar? | Prazo |
|----------|----------------|-------|
| Etiqueta gerada, não postada | ✅ Sim | Até 7 dias |
| Pacote já postado | ❌ Não | - |
| Etiqueta vencida | ✅ Sim | Automático |

O valor é estornado para a carteira do Melhor Envio.

---

## 9. Resolução de Problemas

### 🔴 Erro: "Token inválido ou expirado"

**Causa**: O token foi digitado errado ou expirou.

**Solução**:
1. Gere um novo token no Melhor Envio
2. Copie com cuidado (use o botão de copiar)
3. Cole no OrderZap e salve

### 🔴 Erro: "Saldo insuficiente"

**Causa**: Sua carteira do Melhor Envio não tem saldo para comprar o frete.

**Solução**:
1. Acesse o Melhor Envio
2. Vá em "Carteira"
3. Adicione saldo via PIX (mais rápido)

### 🔴 Erro: "CEP de origem inválido"

**Causa**: O CEP configurado não existe ou está errado.

**Solução**:
1. Verifique o CEP no Google
2. Corrija nas configurações do OrderZap
3. Salve novamente

### 🔴 Erro: "Dimensões inválidas"

**Causa**: O produto não tem peso ou dimensões cadastradas.

**Solução**:
1. Edite o produto
2. Preencha peso (em kg), altura, largura e comprimento (em cm)
3. Salve

**Dimensões mínimas**:
- Peso: 0,3 kg
- Altura: 2 cm
- Largura: 11 cm
- Comprimento: 16 cm

### 🔴 Não aparece opção de frete no checkout

**Possíveis causas**:

1. **Token não configurado**: Vá em Configurações e verifique
2. **Integração desativada**: Ative o switch do Melhor Envio
3. **CEP de destino inválido**: O cliente digitou errado
4. **Região não atendida**: Algumas localidades remotas não têm cobertura

### 🔴 Etiqueta não imprime

**Solução**:
1. Verifique se o popup foi bloqueado pelo navegador
2. Permita popups para o site
3. Tente novamente

### 🔴 Rastreio não atualiza

**Solução**:
1. Clique em "Sincronizar Rastreios" na página de Etiquetas
2. Verifique se o webhook está configurado
3. Aguarde - pode levar até 48h após a postagem para aparecer

---

## 📞 Suporte

### Melhor Envio
- **Site**: [melhorenvio.com.br/ajuda](https://melhorenvio.com.br/ajuda)
- **Chat**: Disponível no painel do Melhor Envio
- **E-mail**: suporte@melhorenvio.com.br

### OrderZap
- Entre em contato pelo WhatsApp de suporte disponível no sistema

---

## ✅ Checklist Final

Antes de começar a usar, verifique:

- [ ] Conta criada no Melhor Envio
- [ ] Dados da empresa completos (CNPJ, endereço)
- [ ] Saldo adicionado na carteira
- [ ] Token gerado com todas as permissões
- [ ] Token configurado no OrderZap
- [ ] CEP de origem preenchido
- [ ] Integração ativada (switch ligado)
- [ ] Teste de cotação realizado
- [ ] Webhook configurado (opcional, mas recomendado)

---

**Última atualização**: Janeiro 2025

*Este guia foi criado para ajudar você a configurar a integração de forma simples e rápida. Se tiver dúvidas, entre em contato com nosso suporte!* 🚀

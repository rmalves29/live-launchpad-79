import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const documents = [
      {
        tenant_id,
        title: "OrderZap - Visão Geral do Sistema",
        category: "Geral",
        content: `# OrderZap - Sistema de Gestão de Pedidos via WhatsApp

## O que é o OrderZap?
O OrderZap é uma plataforma completa de gestão de pedidos integrada ao WhatsApp, desenvolvida especialmente para lojistas que vendem através de lives, bazares e redes sociais.

## Principais Funcionalidades:

### 📱 Módulos do Sistema:
- **Manual**: Cadastro manual de pedidos para vendas tradicionais
- **Live**: Módulo especial para vendas em tempo real durante lives no Instagram/Facebook
- **Checkout**: Link de pagamento personalizado para clientes finalizarem compras
- **Produtos**: Catálogo completo com código, preço, estoque, cor e tamanho
- **Clientes**: Base de dados com histórico de compras e endereços
- **Pedidos**: Gestão completa de pedidos com filtros por status, data e tipo
- **SendFlow**: Envio de mensagens em massa via WhatsApp
- **Agente IA**: Análise inteligente de dados e insights sobre vendas
- **Relatórios**: Dashboards e métricas de desempenho
- **Sorteio**: Ferramenta para realizar sorteios entre clientes
- **Etiquetas**: Geração de etiquetas de envio

### 🔗 Integrações Disponíveis:
- **WhatsApp (Z-API)**: Envio automático de mensagens e confirmações
- **Bling ERP**: Sincronização de pedidos e produtos
- **Melhor Envio**: Cálculo de frete e geração de etiquetas
- **Mercado Pago**: Pagamentos online
- **Pagar.me**: Gateway de pagamentos alternativo
- **ManyChat**: Automação de chatbot

## Como Acessar:
O sistema é acessado pelo navegador web. Cada empresa tem seu próprio subdomínio.`,
        is_active: true
      },
      {
        tenant_id,
        title: "Módulo de Produtos",
        category: "Funcionalidades",
        content: `# Módulo de Produtos

## Acesso:
Menu principal → Produtos

## Funcionalidades:

### ➕ Cadastrar Produto:
1. Clique no botão '+ Novo Produto'
2. Preencha os campos:
   - **Código** (obrigatório): Identificador único do produto
   - **Nome** (obrigatório): Descrição do produto
   - **Preço** (obrigatório): Valor em reais
   - **Estoque**: Quantidade disponível
   - **Cor**: Variação de cor (opcional)
   - **Tamanho**: Variação de tamanho (opcional)
   - **Imagem**: Foto do produto (máx. 5MB)
   - **Tipo de Venda**: Bazar, Live ou Ambos
   - **Ativo**: Se o produto está disponível para venda

### 📤 Importação em Massa:
1. Clique em 'Baixar Modelo' para obter a planilha Excel
2. Preencha a planilha com seus produtos
3. Clique em 'Importar' e selecione o arquivo
4. O sistema processará automaticamente

### 🔍 Buscar Produtos:
Use a barra de busca para encontrar por código ou nome.

### ✏️ Editar/Excluir:
- Clique no ícone de lápis para editar
- Clique na lixeira para excluir
- Selecione múltiplos produtos para excluir em massa

### ⚠️ Dicas:
- Mantenha o estoque atualizado para evitar vendas de produtos indisponíveis
- Use códigos curtos e fáceis de digitar durante lives
- Imagens ajudam clientes a identificar produtos`,
        is_active: true
      },
      {
        tenant_id,
        title: "Módulo de Pedidos",
        category: "Funcionalidades",
        content: `# Módulo de Pedidos

## Acesso:
Menu principal → Pedidos

## Visões Disponíveis:

### 📊 Dashboard:
Visão geral com métricas:
- Total de pedidos
- Valor total em vendas
- Pedidos pagos vs pendentes
- Pedidos do dia

### 📋 Gerenciamento:
Lista completa de pedidos com filtros.

## Filtros Disponíveis:
- **Status de Pagamento**: Todos, Pagos, Pendentes, Cancelados
- **Tipo de Evento**: Live, Bazar, Manual
- **Data do Evento**: Filtrar por data específica
- **Busca**: Por nome do cliente ou telefone

## Ações nos Pedidos:

### ✅ Marcar como Pago:
1. Clique no switch de 'Pago'
2. Confirme a ação
3. O sistema envia automaticamente mensagem de confirmação via WhatsApp
4. Se integrado ao Bling, o pedido é sincronizado automaticamente

### 👁️ Visualizar Detalhes:
Clique no ícone de olho para ver:
- Dados do cliente completos
- Itens do pedido
- Observações
- Status de mensagens enviadas

### ✏️ Editar Pedido:
- Altere itens, valores ou observações
- Adicione/remova produtos

### 🖨️ Marcar como Impresso:
- Selecione pedidos e clique em 'Marcar como Impresso'
- Útil para controle de separação

### 📦 Código de Rastreio:
- Adicione o código de rastreio manualmente
- O sistema envia automaticamente para o cliente via WhatsApp

### ❌ Cancelar Pedido:
- Selecione o pedido e clique em cancelar
- O estoque é devolvido automaticamente`,
        is_active: true
      },
      {
        tenant_id,
        title: "Módulo Live - Vendas ao Vivo",
        category: "Funcionalidades",
        content: `# Módulo Live - Vendas ao Vivo

## Acesso:
Menu principal → Live

## O que é?
Módulo especial para gerenciar vendas durante transmissões ao vivo no Instagram ou Facebook.

## Como Funciona:

### 1️⃣ Configurar Live:
- Defina a data e tipo do evento
- Selecione o grupo de WhatsApp (se aplicável)

### 2️⃣ Durante a Live:
- Clientes comentam o código do produto
- O ManyChat captura e envia para o OrderZap
- OU você digita manualmente o código + telefone

### 3️⃣ Adicionar Item:
1. Digite o telefone do cliente (com DDD)
2. Digite o código do produto
3. Clique em 'Adicionar'
4. O sistema automaticamente:
   - Cria/atualiza o carrinho do cliente
   - Reduz o estoque
   - Envia confirmação via WhatsApp

### 4️⃣ Visualizar Carrinhos:
- Veja todos os carrinhos ativos da live
- Total de itens e valor por cliente

### 5️⃣ Finalizar:
- Ao encerrar, os carrinhos podem ser convertidos em pedidos
- Envie links de pagamento automáticos

## Dicas para Lives:
- Use códigos curtos (ex: A1, B2, C3)
- Mantenha o estoque atualizado antes de começar
- Configure os templates de WhatsApp previamente
- Teste a integração com ManyChat antes da live`,
        is_active: true
      },
      {
        tenant_id,
        title: "Integração WhatsApp (Z-API)",
        category: "Integrações",
        content: `# Integração WhatsApp via Z-API

## Acesso:
Menu WhatsApp → Z-API

## O que é a Z-API?
Serviço que permite enviar mensagens automatizadas pelo WhatsApp Business.

## Como Configurar:

### 1️⃣ Criar Conta Z-API:
1. Acesse z-api.io e crie uma conta
2. Crie uma instância
3. Anote o Instance ID e Token

### 2️⃣ Conectar no OrderZap:
1. Vá em WhatsApp → Z-API
2. Cole o Instance ID
3. Cole o Token
4. Clique em 'Salvar'
5. Escaneie o QR Code com seu WhatsApp

### 3️⃣ Status da Conexão:
- 🟢 Verde: Conectado e funcionando
- 🔴 Vermelho: Desconectado
- 🟡 Amarelo: Aguardando QR Code

## Mensagens Automáticas:

### Tipos de Mensagens:
- **Item Adicionado**: Quando produto é adicionado ao carrinho
- **Pedido Pago**: Confirmação de pagamento recebido
- **Código de Rastreio**: Envio do tracking de entrega
- **Produto Cancelado**: Quando item é removido

### Configurar Templates:
Vá em WhatsApp → Templates para personalizar as mensagens.

## Solução de Problemas:

### WhatsApp desconectou:
1. Verifique se o celular está com internet
2. Reescaneie o QR Code
3. Verifique se a instância Z-API está ativa

### Mensagens não chegam:
1. Verifique se o número está correto (com 55 + DDD)
2. Confirme se a Z-API está conectada
3. Verifique os logs de erro`,
        is_active: true
      },
      {
        tenant_id,
        title: "Integração Bling ERP",
        category: "Integrações",
        content: `# Integração Bling ERP

## Acesso:
Menu → Integrações → Bling

## O que é?
O Bling é um sistema ERP para gestão empresarial. A integração permite sincronizar pedidos e produtos automaticamente.

## Como Configurar:

### 1️⃣ Obter Credenciais no Bling:
1. Acesse sua conta Bling
2. Vá em Preferências → API
3. Crie um novo aplicativo
4. Anote Client ID e Client Secret

### 2️⃣ Conectar no OrderZap:
1. Vá em Integrações → Bling
2. Cole as credenciais
3. Clique em 'Autorizar'
4. Siga o fluxo OAuth do Bling

## Funcionalidades:

### 📦 Sincronização de Produtos:
- Importe produtos do Bling para o OrderZap
- Mantenha estoque sincronizado

### 📋 Sincronização de Pedidos:
- Pedidos pagos são enviados automaticamente ao Bling
- Gera NF-e diretamente no ERP

### 🔄 Sincronização Automática:
Ative a opção para sincronizar automaticamente quando:
- Pedido for marcado como pago
- Produto for atualizado

## Configurações Fiscais:
- **NCM**: Código fiscal do produto
- **CFOP**: Código de operação
- **ICMS**: Configuração de imposto

## Solução de Problemas:

### Token expirado:
1. Vá em Integrações → Bling
2. Clique em 'Reconectar'
3. Autorize novamente

### Pedido não sincronizou:
1. Verifique se todos os dados obrigatórios estão preenchidos
2. Confirme se o cliente tem CPF cadastrado
3. Verifique os logs de erro`,
        is_active: true
      },
      {
        tenant_id,
        title: "Integração Melhor Envio",
        category: "Integrações",
        content: `# Integração Melhor Envio

## Acesso:
Menu → Integrações → Melhor Envio

## O que é?
Plataforma de cotação e contratação de fretes com diversas transportadoras (Correios, Jadlog, Loggi, etc).

## Como Configurar:

### 1️⃣ Criar Conta Melhor Envio:
1. Acesse melhorenvio.com.br
2. Crie sua conta
3. Complete o cadastro da empresa

### 2️⃣ Conectar no OrderZap:
1. Vá em Integrações → Melhor Envio
2. Clique em 'Conectar'
3. Autorize o acesso OAuth
4. Configure o CEP de origem

## Funcionalidades:

### 📊 Cotação de Frete:
- Calcule frete automaticamente no checkout
- Compare preços entre transportadoras
- Exiba prazo de entrega ao cliente

### 🏷️ Geração de Etiquetas:
- Gere etiquetas diretamente no OrderZap
- Múltiplas etiquetas de uma vez
- Impressão em formato padrão

### 📦 Rastreamento:
- Receba atualizações automáticas
- Envie código de rastreio ao cliente

## Configurações:

### Opções de Frete:
Vá em Config → Frete para:
- Definir peso padrão dos produtos
- Configurar dimensões padrão
- Adicionar dias de manuseio

### Frete Personalizado:
Crie opções de frete fixo:
- Retirada em loja: R$ 0,00
- Motoboy: valor fixo
- Frete grátis acima de X reais`,
        is_active: true
      },
      {
        tenant_id,
        title: "Módulo de Clientes",
        category: "Funcionalidades",
        content: `# Módulo de Clientes

## Acesso:
Menu principal → Clientes

## Funcionalidades:

### 📋 Lista de Clientes:
Visualização de todos os clientes cadastrados com:
- Nome
- Telefone
- CPF
- Endereço completo
- Total de pedidos
- Valor total em compras

### ➕ Cadastrar Cliente:
1. Clique em '+ Novo Cliente'
2. Preencha os dados:
   - **Telefone** (obrigatório): Com DDD
   - **Nome** (obrigatório)
   - **CPF**: Para emissão de NF
   - **Email**
   - **Instagram**
   - **Endereço completo**: Para entrega

### 🔍 Buscar Cliente:
- Busque por nome, telefone ou CPF
- Use filtros para segmentar

### ✏️ Editar Cliente:
- Atualize dados cadastrais
- Visualize histórico de compras

### 📤 Exportar:
- Exporte lista de clientes em Excel
- Útil para campanhas de marketing

## Cadastro Automático:
Clientes são criados automaticamente quando:
- Fazem pedido via Live
- Completam checkout
- São importados via planilha

## Mesclagem de Clientes:
Se um cliente tem múltiplos cadastros:
1. Identifique os registros duplicados
2. Mescle mantendo os dados mais completos
3. Histórico de pedidos é unificado`,
        is_active: true
      },
      {
        tenant_id,
        title: "FAQ - Perguntas Frequentes",
        category: "Suporte",
        content: `# Perguntas Frequentes (FAQ)

## 🔐 Acesso e Login

**Como faço login no sistema?**
Acesse pelo navegador usando seu email e senha cadastrados. Se esqueceu a senha, clique em 'Esqueci minha senha'.

**Posso acessar pelo celular?**
Sim! O sistema é responsivo e funciona em qualquer dispositivo.

## 💰 Pagamentos

**Como meus clientes pagam?**
Via link de checkout que gera boleto, PIX ou cartão através do Mercado Pago ou Pagar.me.

**Como sei que um pagamento foi confirmado?**
O sistema atualiza automaticamente via webhook. Você verá o status 'Pago' no pedido.

## 📦 Pedidos

**Posso editar um pedido depois de criado?**
Sim! Clique no ícone de edição e altere itens, valores ou observações.

**Como cancelo um pedido?**
Selecione o pedido e clique em 'Cancelar'. O estoque é devolvido automaticamente.

**Posso unificar pedidos do mesmo cliente?**
Sim, configure o período de mesclagem nas configurações.

## 📱 WhatsApp

**As mensagens não estão sendo enviadas, o que faço?**
1. Verifique se a Z-API está conectada
2. Confirme se o número do cliente está correto
3. Reescaneie o QR Code se necessário

**Posso personalizar as mensagens?**
Sim! Vá em WhatsApp → Templates e edite os textos.

## 🚚 Frete

**Como configuro o frete?**
Vá em Config → Frete e configure:
- CEP de origem
- Peso/dimensões padrão
- Opções de frete personalizado

**Posso oferecer frete grátis?**
Sim! Configure nas opções de frete personalizado.

## 🔧 Suporte

**Como entro em contato com suporte?**
- Chat de suporte no sistema (canto inferior esquerdo)
- WhatsApp do suporte
- Email de suporte`,
        is_active: true
      },
      {
        tenant_id,
        title: "Configurações do Sistema",
        category: "Configuração",
        content: `# Configurações do Sistema

## Acesso:
Menu principal → Config

## Abas Disponíveis:

### 🏢 Empresa:
- Nome da empresa
- CNPJ/CPF
- Endereço completo
- Telefone e email de contato
- Logo da empresa
- Cores do tema

### 🚚 Frete:
- CEP de origem para cálculo
- Peso padrão dos produtos (kg)
- Dimensões padrão (cm)
- Dias de manuseio
- Opções de frete personalizado

### 🎫 Cupons:
Gerenciamento de cupons de desconto:
- Código do cupom
- Tipo: percentual ou valor fixo
- Valor do desconto
- Data de expiração
- Limite de uso
- Cupons progressivos por faixa de valor

### 🎁 Brindes:
Configuração de brindes por valor de compra:
- Nome do brinde
- Valor mínimo de compra
- Descrição
- Ativo/Inativo

### 📅 Disponibilidade:
Datas disponíveis para agendamento de eventos.

## Dicas de Configuração:

### Primeira Configuração:
1. Preencha todos os dados da empresa
2. Configure o CEP de origem
3. Defina peso/dimensões padrão
4. Configure as integrações necessárias

### Manutenção:
- Revise cupons expirados periodicamente
- Atualize brindes conforme promoções
- Mantenha dados da empresa atualizados para NF-e`,
        is_active: true
      }
    ];

    // Insert documents
    const { data, error } = await supabase
      .from("knowledge_base")
      .insert(documents)
      .select();

    if (error) {
      console.error("Error inserting knowledge base:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${documents.length} documentos adicionados à base de conhecimento`,
        count: data?.length || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

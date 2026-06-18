## Objetivo

Mover o disparo de cobranças (página `/whatsapp/cobranca`) do navegador para o servidor, igual ao SendFlow. Hoje o envio roda em um loop dentro da aba — se a aba é fechada, o navegador trava, a rede cai ou o WhatsApp desconecta por um segundo, o envio para no meio. Essa foi exatamente a causa do problema de hoje (Mania de Mulher): apenas 2 de 49 clientes receberam.

Bônus desta correção: descobrimos que o registro do job no banco já estava falhando hoje por causa de uma constraint antiga — `sending_jobs.job_type` só aceita `sendflow` e `mass_message`, e o código tenta inserir `cobranca`. Isso será corrigido junto.

## Como vai funcionar

1. Usuário monta a cobrança (filtros, template, imagem, botão CTA) na página, como hoje.
2. Ao clicar em "Enviar", o navegador **não envia mais nada**. Ele só:
   - Faz upload da imagem (se houver) para o Storage e pega a URL pública.
   - Cria um registro em `sending_jobs` (status `running`) com a lista completa de clientes e o template.
   - Chama a edge function `cobranca-process` em modo background.
3. O servidor executa o loop completo: envia para todos os clientes, respeita delays anti-bloqueio, pausa quando detecta desconexão da Z-API, e se auto-reinvoca antes do timeout de 120s (mesma técnica do `sendflow-process`).
4. A página mostra o progresso em tempo real lendo `sending_jobs.processed_items` (polling a cada 2s). Botões de Pausar / Retomar / Cancelar continuam funcionando — mudam apenas o `status` do job no banco; o servidor obedece na próxima iteração.
5. O usuário pode fechar a aba, o navegador, o computador — o envio continua até o fim no servidor.

## O que muda

### Banco (migration)

- Atualizar o CHECK constraint de `sending_jobs.job_type` para incluir `'cobranca'`.
- Criar bucket público `cobranca-images` no Storage (se ainda não existir) para hospedar a imagem opcional da cobrança.

### Backend (nova edge function)

`supabase/functions/cobranca-process/index.ts` (~450 linhas), espelhada no `sendflow-process`:
- Recebe `{ job_id, tenant_id }`.
- Lê `sending_jobs.job_data` com `customers[]`, `messageTemplate`, `imageUrl`, `buttonEnabled`, `buttonLabel`, `buttonUrl`, `tagId`, delays anti-bloqueio.
- Loop pelos clientes: personaliza mensagem (`{{nome}}`, `{{produtos}}`, `{{total}}`, `{{pedido}}`, `{{link}}`), aplica variação anti-bloqueio (zero-width space + emoji swap leve), envia via Z-API (texto, imagem com legenda ou botão CTA conforme a config).
- Registra cada envio em `whatsapp_messages` (tipo `bulk`, com `batch_id` = `job_id`) — mantém o histórico que a tela já consome.
- Aplica tag no contato via `zapi-proxy` quando configurada.
- Atualiza `processed_items` no banco a cada envio para o frontend exibir o progresso.
- Detecta pausa/cancelamento checando `sending_jobs.status` antes de cada envio.
- Pre-check de conexão Z-API a cada N envios — pausa o job e registra `error_message` se cair.
- Auto-reinvocação a 120s para evitar kill por timeout (idêntico ao SendFlow).

### Frontend (`src/pages/whatsapp/Cobranca.tsx`)

- Remover o loop client-side (`for (let i = 0; i < customers.length; i++)` e tudo dentro dele).
- `handleSendAll` passa a:
  1. Fazer upload da imagem (se houver) para o bucket `cobranca-images`.
  2. Inserir o `sending_jobs` com `job_type: 'cobranca'`, `status: 'running'`, `total_items: customers.length`, e `job_data` contendo a lista completa de destinatários e configuração.
  3. Invocar `cobranca-process` via `supabase.functions.invoke` (sem aguardar resposta — é background).
  4. Marcar o `jobIdRef` e ativar o polling de progresso já existente (pollIntervalId).
- O painel de progresso, botões de pausar/retomar/cancelar e modal de desconexão continuam funcionando — eles já operam via `sending_jobs.status`.
- Banner de "envio órfão" também segue funcionando — agora indicará jobs realmente rodando no servidor.

## Riscos e mitigações

- **Tamanho do `job_data`**: listas muito grandes (1000+ clientes com itens detalhados) podem inflar a coluna `jsonb`. Mitigação: o template é guardado uma única vez; cada cliente armazena só os campos necessários para personalização (`phone`, `name`, `order_id`, `total`, `payment_link`, lista resumida de produtos). Em testes com 500 clientes isso fica <500KB, dentro do limite confortável.
- **Imagem em base64**: hoje a imagem é mandada inline em cada envio. Faremos upload uma única vez e usaremos a URL pública — mais rápido e leve.
- **Compatibilidade com cobranças "no ar" agora**: nenhuma — não há cobranças `running` no banco, então a troca é segura.

## Entregáveis

1. Migration: ajuste do CHECK constraint + bucket `cobranca-images`.
2. Nova edge function `cobranca-process`.
3. Refactor da página `Cobranca.tsx` (remover loop, adicionar upload + invoke).
4. Teste manual: disparar uma cobrança pequena (2-3 clientes) e validar que termina mesmo fechando a aba.
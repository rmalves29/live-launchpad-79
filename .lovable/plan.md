## O que é possível hoje (e o que não é)

Verifiquei a integração atual (`instagram-sync-live-comments`, `instagram-webhook`, tabela `instagram_live_comments`, escopos OAuth `instagram_business_basic / manage_comments / manage_messages`).

| Métrica | Viável? | Como |
|---|---|---|
| Data e hora de início da live | Sim | Campo `timestamp` do `live_media` (já buscado, mas não é salvo hoje) |
| Duração da live | Sim (aproximada) | O sync já roda a cada 1 min; grava-se `first_seen`/`last_seen` enquanto `status = LIVE` e fecha ao sumir/encerrar |
| Total de comentários | Sim | Contagem em `instagram_live_comments` por `media_id` (+ `comments_count` do Graph como referência) |
| Comentários que geraram pedido | Sim | Hoje **não existe** vínculo comentário → pedido; é preciso gravar `order_id`/`cart_item_id` no comentário quando o webhook cria o item |
| Pessoas únicas que comentaram | Sim | Distinct de `instagram_user_id` |
| **Pico de espectadores na live** | **Não** | A API oficial do Instagram (Graph/Instagram API) não expõe contagem de viewers nem insights de `live_media`. Nenhum escopo libera isso. O número só aparece no app durante a transmissão |

Ou seja: tudo o que você pediu é possível, **exceto a quantidade máxima de pessoas que entraram na live** — esse dado não existe em nenhuma API do Meta. O mais próximo é "comentaristas únicos" como proxy de engajamento.

## Plano de implementação

### 1. Nova tabela `instagram_lives`
Registro por transmissão: `tenant_id`, `media_id` (único por tenant), `started_at` (timestamp do Graph), `ended_at`, `last_seen_at`, `status`, `permalink`, `comments_count_api`.

### 2. Atualizar `instagram-sync-live-comments`
- A cada execução (já é 1×/min via `pg_cron`), fazer upsert do `live_media` na nova tabela: cria com `started_at` na primeira vez, atualiza `last_seen_at` nas seguintes.
- Quando um `media_id` ativo deixar de aparecer na lista de lives (ou vier com status encerrado), marcar `ended_at = last_seen_at` → duração = `ended_at - started_at`.

### 3. Vincular comentário → pedido
- Adicionar `order_id` (e `matched_quantity`) em `instagram_live_comments`.
- No `instagram-webhook`, depois de criar/atualizar o item no carrinho, gravar o `order_id` resultante no registro do comentário.
- Backfill opcional dos comentários antigos por telefone/username + janela de tempo (aproximado; posso deixar de fora se preferir dados só a partir de agora).

### 4. Painel de relatório
Na tela **Instagram Live Comments** (`src/components/integrations/InstagramLiveComments.tsx`), nova aba/seção "Relatório de Lives" listando cada live com:
- Data/hora de início (fuso Brasília, -03:00) e duração
- Total de comentários e comentaristas únicos
- Comentários com código de produto reconhecido
- Comentários que geraram pedido + valor total gerado
- Taxa de conversão (comentários com pedido ÷ total)
- Link para o `permalink` da live

Com filtro por período e detalhe expansível por live.

### Observação técnica
A duração depende do sync rodando durante a live; se a live começar e terminar entre duas execuções do cron, ela ainda é registrada, mas com duração próxima de zero. Se quiser mais precisão, dá para reduzir o cron para 30s durante o horário comercial.

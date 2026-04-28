## Diagnóstico do problema

A FL Semi Joias enviou o produto **C00692** com sucesso às 19:29 para 7 grupos (job `3fcd8a41`). Em seguida, o usuário tentou reenviar 5 vezes (19:34 a 19:50). Todas as tentativas foram **silenciosamente puladas** pela proteção anti-duplicata de **8 horas** existente em `sendflow-process` (linha 553-574: chama RPC `is_product_recently_sent` com `p_hours: 8`).

Resultado: as tasks ficam como `status='skipped'` com `error_message='Duplicata (8h)'`, o job vira `completed`, e a UI mostra apenas **"Envio Finalizado!"** com Enviadas: 0, Erros: 0 — sem indicar que tudo foi pulado por duplicata. Para o usuário, parece que "o sistema disse que enviou mas a mensagem não chegou".

## O que será feito

### 1. Reduzir a janela anti-duplicata para 15 minutos
- Em `supabase/functions/sendflow-process/index.ts` (linhas 553-574), trocar `p_hours: 8` pela nova janela.
- Como a RPC `is_product_recently_sent` recebe horas, vou alterar a chamada para usar uma fração (`0.25`) **ou** criar uma versão com parâmetro em minutos.
- Verificar a assinatura atual da RPC no banco. Se ela só aceita `integer hours`, criar nova função `is_product_recently_sent_minutes(p_tenant_id, p_product_id, p_group_id, p_minutes)` via migration e usar ela.
- Atualizar a `error_message` da task pulada de `'Duplicata (8h)'` para `'Duplicata (15min)'`.

### 2. Mostrar duplicatas puladas na UI do SendFlow
Hoje a tela só mostra os contadores: Enviadas, Erros, Total, Duração. Vou adicionar:
- Um quarto card **"Puladas"** (cor amarela/âmbar) ao lado de Erros, mostrando a quantidade de tasks com `status='skipped'`.
- Quando puladas > 0, exibir uma mensagem amarela abaixo do "Envio Finalizado!": *"X mensagens foram puladas porque o mesmo produto já foi enviado para o(s) mesmo(s) grupo(s) nos últimos 15 minutos. Aguarde alguns minutos para reenviar."*
- A contagem de puladas vem de uma query a `sendflow_tasks` filtrando `status='skipped'` para o `job_id` atual (ou via somatório no `job_data`).

Arquivos do front a tocar (a confirmar lendo o código):
- `src/hooks/useBackendSendFlow.ts` — incluir contagem de skipped no estado retornado.
- `src/pages/sendflow/Index.tsx` ou componente de progresso (`src/components/SendingProgressLive.tsx`) — renderizar o card e a mensagem.

### 3. Não alterar nada em job_data nem na lógica de delay
- Os delays entre grupos/produtos continuam iguais.
- O fluxo de pausar/retomar/cancelar continua igual.
- A tabela `sendflow_history` continua registrando tudo igual (serve de base para a checagem).

## Detalhes técnicos

**Migration SQL** (será criada se a RPC atual só aceitar `integer hours`):
```sql
CREATE OR REPLACE FUNCTION public.is_product_recently_sent_minutes(
  p_tenant_id uuid,
  p_product_id bigint,
  p_group_id text,
  p_minutes integer
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sendflow_history
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND group_id  = p_group_id
      AND sent_at >= (now() AT TIME ZONE 'UTC') - (p_minutes || ' minutes')::interval
  );
$$;
```

**Impacto**: nenhuma quebra. Reenviar o mesmo produto para o mesmo grupo após 15min passa a funcionar normalmente. Antes de 15min continua sendo bloqueado (proteção anti-spam Z-API), mas agora **com aviso visível na UI**.

## Pós-implementação

Vou pedir para você testar: reenviar agora o mesmo C00692 para os mesmos grupos — deve aparecer card amarelo "Puladas: 7" com a mensagem explicativa. Espere 15min e reenvie — deve enviar normalmente.
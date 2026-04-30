
# Limpeza Segura de Logs Antigos — Política Mista

## Escopo

Apagar **apenas tabelas de log/telemetria** (zero impacto em tabelas de negócio):

| Tabela | Coluna data | Retenção | Estimativa a apagar |
|---|---|---|---:|
| `webhook_logs` | `created_at` | 30 dias | ~49.992 |
| `whatsapp_messages` | `created_at` | 60 dias | ~26.272 |
| `sendflow_tasks` | `created_at` | 30 dias | ~12.100 |
| `sendflow_history` | `sent_at` | 30 dias | ~9.616 |
| **TOTAL** | | | **~97.980** |

**Não tocar**: `orders`, `customers`, `products`, `cart_items`, `carts`, `tenants`, `payment_integrations`, `fe_group_events`, `audit_logs`.

## Passo 1 — Criar tabela de auditoria da limpeza

```sql
CREATE TABLE IF NOT EXISTS public.cleanup_runs (
  id           bigserial PRIMARY KEY,
  table_name   text NOT NULL,
  policy       text NOT NULL,
  date_column  text NOT NULL,
  cutoff_at    timestamptz NOT NULL,
  count_before bigint,
  deleted      bigint NOT NULL DEFAULT 0,
  count_after  bigint,
  size_before  text,
  size_after   text,
  batches      integer NOT NULL DEFAULT 0,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
ALTER TABLE public.cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_only" ON public.cleanup_runs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
```

## Passo 2 — Procedure de delete em batches

```sql
CREATE OR REPLACE PROCEDURE public.cleanup_table_in_batches(
  p_table text, p_date_col text, p_cutoff timestamptz, p_batch int DEFAULT 5000
) LANGUAGE plpgsql AS $$
DECLARE
  v_run_id bigint;
  v_before bigint;
  v_after  bigint;
  v_size_b text;
  v_size_a text;
  v_deleted_total bigint := 0;
  v_deleted_batch bigint;
  v_batches int := 0;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_before;
  EXECUTE format('SELECT pg_size_pretty(pg_total_relation_size(%L))', 'public.'||p_table) INTO v_size_b;

  INSERT INTO public.cleanup_runs(table_name, policy, date_column, cutoff_at, count_before, size_before)
  VALUES (p_table, 'mista_v1', p_date_col, p_cutoff, v_before, v_size_b)
  RETURNING id INTO v_run_id;

  LOOP
    EXECUTE format(
      'WITH del AS (SELECT ctid FROM public.%I WHERE %I < %L ORDER BY %I LIMIT %s)
       DELETE FROM public.%I t USING del WHERE t.ctid = del.ctid',
      p_table, p_date_col, p_cutoff, p_date_col, p_batch, p_table
    );
    GET DIAGNOSTICS v_deleted_batch = ROW_COUNT;
    v_deleted_total := v_deleted_total + v_deleted_batch;
    v_batches := v_batches + 1;
    COMMIT;  -- libera locks entre batches
    EXIT WHEN v_deleted_batch < p_batch;
  END LOOP;

  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_after;
  EXECUTE format('SELECT pg_size_pretty(pg_total_relation_size(%L))', 'public.'||p_table) INTO v_size_a;

  UPDATE public.cleanup_runs
     SET deleted=v_deleted_total, count_after=v_after, size_after=v_size_a,
         batches=v_batches, finished_at=now()
   WHERE id=v_run_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.cleanup_runs SET error=SQLERRM, finished_at=now() WHERE id=v_run_id;
  RAISE;
END;
$$;
```

## Passo 3 — Pré-validação (COUNT antes de cada delete)

Será executado um SELECT por tabela confirmando quantos registros caem na janela, e o resultado mostrado **antes** do CALL.

## Passo 4 — Execução sequencial (uma tabela por vez)

```sql
CALL public.cleanup_table_in_batches('webhook_logs',     'created_at', now() - interval '30 days', 5000);
CALL public.cleanup_table_in_batches('whatsapp_messages','created_at', now() - interval '60 days', 5000);
CALL public.cleanup_table_in_batches('sendflow_tasks',   'created_at', now() - interval '30 days', 5000);
CALL public.cleanup_table_in_batches('sendflow_history', 'sent_at',    now() - interval '30 days', 5000);
```

Cada CALL faz `COMMIT` por batch (5k linhas), evitando lock longo e WAL inflado.

## Passo 5 — Relatório final

```sql
SELECT table_name, date_column, cutoff_at,
       count_before, deleted, count_after,
       size_before, size_after, batches, error,
       started_at, finished_at,
       round(extract(epoch from finished_at-started_at))::int AS duration_s
FROM public.cleanup_runs
WHERE started_at >= now() - interval '1 hour'
ORDER BY id;
```

E uma nova simulação de retenção pendente:

```sql
SELECT 'webhook_logs' t, count(*) FROM webhook_logs WHERE created_at < now()-interval '30 days'
UNION ALL SELECT 'whatsapp_messages', count(*) FROM whatsapp_messages WHERE created_at < now()-interval '60 days'
UNION ALL SELECT 'sendflow_tasks', count(*) FROM sendflow_tasks WHERE created_at < now()-interval '30 days'
UNION ALL SELECT 'sendflow_history', count(*) FROM sendflow_history WHERE sent_at < now()-interval '30 days';
```

## Garantias de segurança

- ✅ Apenas tabelas de log; **nenhuma tabela de negócio é tocada**.
- ✅ Filtros por janela temporal (registros recentes preservados).
- ✅ Batches de 5.000 com COMMIT entre eles → sem lock longo, sem inflar WAL.
- ✅ Auditoria por execução em `cleanup_runs` (antes/depois, tamanho, batches, erro).
- ✅ DELETE via `ctid` + CTE `LIMIT` (rápido e indexado).
- ✅ Sem `pg_cron`, sem trigger, sem automação — execução **manual única**.
- ✅ Em caso de erro, o procedure registra `error` e propaga; nenhuma tabela fica em estado parcial inválido (cada batch é atômico).

## Observação técnica

`pg_total_relation_size` mostra o tamanho **antes do VACUUM**. O espaço só é devolvido ao SO após `VACUUM` (autovacuum cuida disso em minutos/horas). Posso opcionalmente rodar `VACUUM (ANALYZE)` ao final para mostrar redução real — mas `VACUUM FULL` exige lock exclusivo e **não recomendo** sem janela de manutenção.

## Entregáveis ao final

1. SQL exato executado (este plano).
2. Quantidade apagada por tabela (de `cleanup_runs.deleted`).
3. Erros (de `cleanup_runs.error`, se houver).
4. Tamanho antes/depois (`size_before` / `size_after`).
5. Registros restantes acima da retenção (deve ser ~0).

Aprovando, saio do modo plan e executo na ordem: migração (procedure + tabela auditoria) → COUNT pré → CALLs → relatório.

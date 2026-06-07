# Persistência da Cobrança + Painel de Envios Ativos

## Parte 1 — Persistir envios da Cobrança no banco

Hoje o envio em massa da página **Cobrança** roda 100% no estado React. Se o usuário recarrega a página ou fecha a aba, perde controle e o envio fica órfão. Vamos espelhar o progresso na tabela `sending_jobs` (já existente, já usada pelo SendFlow).

### Mudanças em `src/pages/whatsapp/Cobranca.tsx`

1. Ao iniciar envio:
   - `INSERT` em `sending_jobs` com `job_type='cobranca'`, `status='running'`, `total_items`, `job_data` (lista de telefones + mensagem) e guardar o `id` retornado num ref.
2. A cada cliente processado (sucesso ou falha):
   - `UPDATE sending_jobs SET processed_items, current_index, updated_at` — sem bloquear o loop (fire-and-forget).
3. Ao pausar / retomar / cancelar / concluir:
   - `UPDATE` correspondente em `status` (`paused`, `running`, `cancelled`, `completed`) com `paused_at` / `completed_at`.
4. No `useEffect` de mount:
   - Buscar `sending_jobs` desse tenant com `job_type='cobranca'` e `status IN ('running','paused')`.
   - Se houver, mostrar banner: **"Envio em andamento detectado — Retomar / Cancelar"**.
   - "Retomar" reidrata o estado a partir de `job_data` + `current_index` e continua do ponto que parou.
   - "Cancelar" marca como `cancelled` no banco.

### Observações
- Polling do status remoto a cada 5s enquanto envia — se outra aba marcou `cancelled`, este loop também para.
- Sem mudanças no backend; é só CRUD em tabela existente.

## Parte 2 — Painel "Envios Ativos"

Nova página `src/pages/EnviosAtivos.tsx` acessível na sidebar (menu WhatsApp), listando tudo num único lugar.

### Fontes consolidadas
- `sending_jobs` (Cobrança + SendFlow mass_message)
- `sendflow_tasks` (tasks pendentes do SendFlow)
- `scheduled_jobs` / `scheduled_messages` (agendamentos)

### UI
Tabela com colunas:
| Origem | Tipo | Status | Progresso | Iniciado em | Ações |
|---|---|---|---|---|---|

- **Progresso**: barra `processed / total` + percentual.
- **Status** com badge colorido (running=verde, paused=amarelo, cancelled/failed=vermelho, completed=cinza).
- **Ações**: Pausar, Retomar, Cancelar, Ver detalhes. Botões habilitados conforme status.
- Auto-refresh a cada 5s (`setInterval`).
- Filtro por tipo (Cobrança / SendFlow / Agendamento) e por status.

### Rota
- `/envios-ativos` com guard de autenticação padrão.
- Item de menu na sidebar do WhatsApp: "Envios Ativos" com ícone `Activity`.

## Ordem de implementação
1. Criar `EnviosAtivos.tsx` + rota + item de menu (parte 2 — mais simples, depende só do que já existe).
2. Adicionar persistência em `Cobranca.tsx` (parte 1).
3. Validar fluxo completo: iniciar envio → recarregar → retomar → ver no painel.

Sem migrations — `sending_jobs` já tem todas as colunas necessárias.

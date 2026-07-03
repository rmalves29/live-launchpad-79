## Objetivo

Na seção "Modo de Proteção por Consentimento", remover totalmente os campos **Template A — Solicitação de Permissão** e **Template B — Com Link (Consentimento Válido)**. Manter apenas o **toggle de ativar/desativar**. Toda mensagem de item adicionado passa a usar exclusivamente o **template de Item Adicionado** já configurado no sistema (o mesmo usado quando a proteção está desligada).

## O que muda para o usuário

- Na tela de configuração da integração WhatsApp (Z-API / uazapi), o bloco "Modo de Proteção por Consentimento" fica assim:
  - Título + descrição
  - **Toggle**: Ativar proteção (ligado/desligado)
  - Lista explicativa do funcionamento (20 min de espera, 3 dias liberado, 1h de bloqueio)
  - Botão **Salvar Proteção**
- Não existirão mais campos Template A / Template B.
- Quando a proteção estiver ativada, o sistema envia **o mesmo template de Item Adicionado** já cadastrado hoje (com botão "Pagar Agora" e variáveis) — a única diferença é que passa a respeitar a máquina de estados de consentimento (waiting_reply → blocked → active).

## Detalhes técnicos

Alterações no frontend (`src/components/ZAPISettings.tsx` e `src/components/ZAPIAdvancedSettings.tsx`):
- Remover qualquer bloco/estado ligado a `templateSolicitacao`, `templateComLink`, `DEFAULT_TEMPLATE_SOLICITACAO`, `DEFAULT_TEMPLATE_COM_LINK` e o bloco legado "Templates de Mensagem (Modo Padrão)" atualmente escondido por `{false && ...}`.
- Manter apenas o card com o Switch `consent_protection_enabled` + descrição + botão salvar.
- Confirmar que a UI carrega/salva apenas `consent_protection_enabled` (o resto — `template_item_added`, botão Pagar Agora, flags — permanece intocado).

Alterações no backend:
- `supabase/functions/_shared/consent-v2.ts` já não usa esses templates. Nenhuma mudança necessária.
- `zapi-send-item-added` e `zapi-webhook` já usam o `template_item_added` padrão em ambos os fluxos (fluxo unificado feito em iteração anterior). Nenhuma mudança necessária.

Banco de dados (migration):
- Fazer `ALTER TABLE integration_whatsapp DROP COLUMN IF EXISTS template_solicitacao, DROP COLUMN IF EXISTS template_com_link;` para eliminar de vez os campos órfãos. Isso também limpa o `types.ts` na próxima geração de tipos.

## Resultado final

- Uma única fonte de verdade para a mensagem de item adicionado: `integration_whatsapp.template_item_added` (o mesmo template que aparece hoje na seção "Item Adicionado" da tela).
- O toggle de proteção controla apenas o **quando** enviar (respeitando consentimento), não o **conteúdo** da mensagem.

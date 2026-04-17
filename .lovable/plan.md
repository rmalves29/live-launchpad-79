
Objetivo: simplificar a emissão de etiquetas removendo a dependência da API PPN dos Correios e usando apenas a integração MeusCorreios, que já está mais estável no projeto.

1. Mapear onde a emissão PPN está acoplada
- Revisar `src/components/integrations/CorreiosCWSLabels.tsx` e os pontos da UI que expõem “Etiquetas Correios”.
- Confirmar onde `correios-labels` é invocada e onde a integração `provider = 'correios'` aparece como opção de emissão.

2. Descontinuar a emissão PPN na interface
- Remover ou ocultar a aba/componente de etiquetas do contrato direto dos Correios.
- Ajustar textos e status da integração para deixar claro que emissão de etiqueta passa a ocorrer via MeusCorreios.
- Se fizer sentido, mostrar aviso curto: “Emissão via contrato direto descontinuada; use MeusCorreios”.

3. Redirecionar o fluxo de emissão para MeusCorreios
- Fazer a UI de emissão chamar `process-meus-correios` em vez de `correios-labels`.
- Reaproveitar o padrão já existente de geração de rastreio + etiqueta base64 retornado por `process-meus-correios`.
- Garantir que seleção de pedidos, override de serviço e download do PDF continuem funcionando.

4. Remover código morto do contrato direto
- Eliminar referências de uso de `correios-labels` no frontend.
- Opcionalmente remover a Edge Function `correios-labels` e o componente `CorreiosCWSLabels.tsx` se não houver mais uso.
- Manter `correios-shipping` apenas se ainda for necessário para cotação; caso também queira aposentar o frete via contrato direto, isso pode virar uma segunda etapa separada.

5. Ajustar descoberta/prioridade de integrações
- Revisar `src/lib/shipping-utils.ts` para garantir que a lógica de integrações não continue sugerindo o fluxo antigo de etiqueta PPN.
- Confirmar se “correios” seguirá existindo só para cotação ou se deve ser totalmente retirado das opções operacionais.

6. Validação final
- Testar seleção de pedidos e emissão end-to-end usando apenas MeusCorreios.
- Validar casos de sucesso, pedido já com rastreio, endereço incompleto e erro de serviço inválido.
- Confirmar que download do PDF e atualização do tracking continuam gravando no pedido corretamente.

Detalhes técnicos
- Arquivos com maior chance de mudança:
  - `src/components/integrations/CorreiosCWSLabels.tsx`
  - `src/components/integrations/CorreiosIntegration.tsx`
  - `src/lib/shipping-utils.ts`
  - `supabase/functions/process-meus-correios/index.ts`
  - possivelmente remoção de `supabase/functions/correios-labels/index.ts`
- Benefício principal: reduz complexidade, remove um fluxo instável e concentra a emissão em uma integração já funcional.
- Risco principal: se ainda houver clientes usando contrato direto só para etiqueta, precisamos trocar cuidadosamente os pontos da UI para não deixar ação quebrada.

Resultado esperado
- A parte de emissão de etiquetas fica menor, mais previsível e sem dependência do estado “Pendente” da pré-postagem PPN.
- O sistema passa a ter um único caminho de emissão: MeusCorreios.

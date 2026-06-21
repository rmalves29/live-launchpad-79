# Plano: Responsividade mobile do sistema inteiro

Desktop fica idêntico. Toda a adaptação acontece abaixo de 768px (breakpoint `md` do Tailwind). Nenhuma funcionalidade, configuração ou coluna é removida — só muda a forma de exibir no celular.

## 1. Layout global (shell do app)

- **Sidebar**: no mobile, vira off-canvas (gaveta) acionada por um botão de menu no topo. No desktop continua fixa igual hoje.
- **Header/topbar**: reduzir altura, esconder labels longos, manter ações principais (notificações, perfil, seletor de empresa) em ícone.
- **Container das páginas**: padding lateral menor no mobile (`px-3` em vez de `px-6/8`), permitir largura 100%.
- **Modais grandes**: garantir `max-h-[90vh]`, scroll interno, header/footer fixos (já é padrão do projeto, vou auditar página por página).

## 2. Tabelas viram cards empilhados no mobile

Padrão a aplicar em todas as listagens:

- Desktop (`md:` e acima): tabela atual, intocada.
- Mobile (`<md`): cada linha vira um card com as infos principais em destaque (ex.: número do pedido, cliente, status, total) e as ações (botões/menu) acessíveis por toque.
- Nenhuma coluna some — informações secundárias entram no card em linhas menores ou num "ver mais" expansível quando forem muitas.

Páginas com tabelas que recebem esse tratamento:

- Pedidos, Pedidos cancelados, Pedido manual (lista de itens)
- Produtos (listagem + variações)
- Clientes
- Cupons, Presentes, Promoções
- Sendflow (campanhas, jobs)
- WhatsApp: Cobrança, Envios ativos, Grupos, Templates, Contatos
- Instagram: Live, Comentários, DMs
- Integrações: listas de ERPs/transportadoras
- Relatórios: tabelas de ranking, RFM, faturamento
- Logs/Auditoria
- Configurações (usuários, roles, etc.)

## 3. Formulários e modais

- Inputs, selects e botões em largura total no mobile.
- Grids de 2–4 colunas viram 1 coluna abaixo de `md`.
- Botões de ação no rodapé do modal empilhados no mobile, lado a lado no desktop.
- Date pickers, comboboxes e dropdowns com toque confortável (mín. 44px de altura).

## 4. Telas operacionais críticas (auditoria detalhada)

Vou revisar caso a caso para garantir que nada quebra:

- Pedido manual (carrinho + busca de produto + cliente + frete + pagamento)
- Cobrança (seleção de clientes, preview da mensagem, banner de progresso)
- Live Instagram (lançador de vendas)
- Envios ativos (banner persistente + controles)
- Checkout admin / cupons aplicados
- Dashboard / Relatórios (gráficos com `ResponsiveContainer`, KPIs em 1 coluna no mobile)

## 5. Componentes compartilhados

- `DataTable` / wrappers de tabela: adicionar prop ou variante `mobileAsCards` com renderização alternativa.
- Diálogos do shadcn já são responsivos; só ajusto padding e largura.
- Filtros e barras de busca: colapsam num botão "Filtros" que abre um sheet no mobile.

## Detalhes técnicos

- Breakpoint principal: `md` (768px). Uso pontual de `sm` (640px) para casos muito apertados.
- Tailwind utilitários `hidden md:table` / `md:hidden` para alternar tabela ↔ cards sem duplicar lógica de dados.
- Nenhum token de design novo; reaproveito `Card`, `Badge`, `Button`, `Sheet`, `Drawer` já existentes.
- Nenhuma mudança em queries Supabase, edge functions, RLS ou regras de negócio.
- Sem mudança no desktop: todas as classes novas são prefixadas com `md:` ou aplicadas só dentro de blocos `md:hidden`.

## Ordem de execução

1. Shell (sidebar off-canvas + header + container).
2. Componentes compartilhados de tabela (criar variante card).
3. Pedidos, Pedido manual, Cobrança, Envios ativos, Live (operação diária).
4. Produtos, Clientes, Cupons, Presentes, Promoções.
5. Sendflow, WhatsApp (grupos/templates/contatos), Instagram.
6. Integrações, Relatórios, Configurações, Logs.
7. Passada final em modais e formulários extensos.

## Fora do escopo

- Mudanças visuais no desktop.
- Reescrita de telas ou de fluxos.
- Novo app nativo / PWA instalável (posso fazer depois se quiser).

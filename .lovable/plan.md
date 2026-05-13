# Ajustar `/design-preview` para ficar igual ao mockup enviado

O preview atual está com um layout "genérico" (cards de stats grandes, tabela com colunas erradas). O mockup que você acabou de mandar (`mockup-pedidos-v2-2.html`) é completamente diferente: é a tela **Gestão de Pedidos** com tabela densa, bulk actions no topo, card de filtros com botões de período e sidebar fina "Cartzy". Vou refazer pixel-a-pixel.

## O que muda (apenas dentro de `src/pages/design-preview/`)

### 1. `_components/PreviewSidebar.tsx` — refazer
- Largura **220px** (não 256px)
- Logo: quadrado indigo + texto **"Cartzy"** (não "OrderZap")
- Card de usuário logo abaixo: avatar redondo "FL" + "FL Semi Joias" + e-mail
- Grupos com label cinza ("Principal", "Outras páginas")
- Itens: **Pedidos** (ativo), Produtos / Clientes / Relatórios marcados como "(em breve)" desabilitados
- Bloco rodapé indigo claro: "Mockup — Página 1/11 · Testando: Pedidos"
- Remover badge "PRO" e botão "Gerenciar plano"

### 2. `_components/PedidosPreview.tsx` — reescrever do zero
- **Header**: "Gestão de Pedidos" + subtítulo "Live de Sábado — 09/05/2026 · FL Semi Joias"
- **Bulk actions** alinhadas à direita: Imprimir Selecionados (0), Marcar como Impresso, Cancelar Selecionados (0) (laranja outline), Deletar Selecionados (0) (vermelho outline), Exportar CSV
- **Card de filtros**: ícone funil + "Filtros", linha com busca por telefone, select Status Pagamento, select Tipo Evento, botão Limpar Filtros
- Linha **Período**: chips Hoje / Semana / Mês (ativo) / Ano / Período + input date
- **Tabela densa** com colunas: checkbox, #Pedido (mono), Telefone (com badge "2 pedidos" laranja quando aplicável), Total, Pago? (toggle verde + badge), Impresso? (texto + lápis), Tipo Evento (badge azul/roxo), Data Evento, Disparo (botão WhatsApp verde + link pagamento amarelo), Rastreio (badge azul truncado), Observação (truncado), Ações (imprimir, editar, visualizar azul, cancelar laranja)
- ~6 linhas mock variando status (pago/pendente/cancelado), impresso/não impresso, com/sem rastreio, evento LIVE/Bazar
- Toggle custom (bolinha 22x40, verde quando ligado) implementado com Tailwind
- Remover totalmente os 4 cards de stats (Pedidos hoje, Faturamento, etc) — não existem no mockup

### 3. `Index.tsx` — pequeno ajuste
- Manter toggle topo entre Pedidos / Pedido Manual
- Mudar bg para `#f9fafb` (já está)

### 4. Não mexer
- `ManualPreview.tsx` (continua como está)
- `EditOrderModalPreview.tsx` (continua)
- Nada fora de `src/pages/design-preview/`

## Observação técnica
Cores hex diretas do mockup (`#4f46e5`, `#dcfce7`/`#16a34a`, `#fef9c3`/`#ca8a04`, `#fee2e2`/`#dc2626`, `#dbeafe`/`#2563eb`, `#ffedd5`/`#ea580c`, `#f3e8ff`/`#9333ea`, `#f9fafb`, `#e5e7eb`) — isolado no preview, sem tocar no design system global.

Posso aplicar?

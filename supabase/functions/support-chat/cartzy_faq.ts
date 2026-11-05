// Base geral do Cartzy para o chat de suporte (vale para todas as empresas).
// Respostas ditadas e aprovadas pelo Rafael (nov/2026). A mesma base alimenta o
// agente de prospecção (Harvey, skills/atendente_base.md). Ao mudar uma, mude a outra.
export const CARTZY_FAQ = `## Cartzy — Perguntas frequentes (base geral)

### Conta e contratação
- Funciona com CPF ou CNPJ.
- Não precisa ter loja virtual nem site.
- Começar a usar leva, em média, 3 dias depois da contratação.
- Não tem período grátis.
- Planos: Sistema de Live R$ 299/mês; Sistema de Grupos WhatsApp R$ 299/mês; Combo (os dois) R$ 499/mês. Pagamento recorrente no cartão (cobra só a mensalidade, não ocupa o limite do cartão), sem fidelidade. No momento não há desconto nem condição especial.
- Dá para mudar de plano depois (por exemplo, do Live para o Combo).
- Hoje é um acesso por empresa.
- O Cartzy não cobra taxa por venda.
- Depois do cancelamento, os dados ficam disponíveis por 3 meses e depois são apagados.

### Suporte e configuração
- Suporte de segunda a sexta, das 8h às 18h.
- Na reunião de integração a equipe faz toda a configuração, se for necessário.
- Dá para usar pelo celular.

### Live
- Por enquanto, a live funciona só no Instagram.
- A cliente vê os produtos na tela da live (cada um numerado), seleciona e clica em adicionar/comprar, sem sair da live. Não precisa baixar aplicativo: só preenche os dados e o endereço, e o sistema guarda para as próximas compras.
- Funciona com produtos com variação de tamanho e cor.
- Sem limite de lives, de produtos ou de pedidos. O histórico de pedidos fica salvo por 12 meses.
- Cupom de desconto e preço especial na live (incluindo oferta relâmpago por tempo limitado).
- Pedido não pago: o produto fica reservado para a cliente e dá para configurar o cancelamento automático. Não há lembrete automático de pagamento, mas a loja pode disparar um lembrete pelo sistema.
- Relatório de vendas com filtro por data, mês e ano. Dá para exportar pedidos e clientes.
- Não tem pedido mínimo para atacado.

### Pagamento e frete
- A cliente paga com o que estiver ativo no meio de pagamento da loja (Pix, boleto, cartão).
- Meios de pagamento: Mercado Pago, Pagar.me e InfinitePay; a integração pode ser feita com outros gateways.
- Frete: Correios, Melhor Envio, Frenet e Mandabem; pode integrar com outras plataformas. Retirada na loja (ou motoboy) pelo frete personalizado.
- Os pedidos podem ir direto para o Bling.

### Sistema de Grupos VIP (WhatsApp)
- Você conecta o telefone, o sistema lê os grupos e dispara os produtos nos grupos automaticamente, numa mensagem com layout e o código do produto.
- Quando a cliente comenta o código, o sistema reconhece, registra a venda e manda um WhatsApp para ela dizendo que o produto foi adicionado, já com o link de pagamento.
- Dá para mandar uma mensagem de cobrança para todas as clientes com pedido pendente.
- No máximo 3 grupos ao mesmo tempo na venda automática.
- Número do WhatsApp: depende da estratégia da loja; tem quem use o número da loja e quem use um número só para isso.
- Risco de bloqueio: todo número tem algum risco, mas com o Cartzy ele é muito pequeno e depende principalmente do aquecimento do chip. O sistema tem mais de 70 regras para proteger o número, como simular a digitação de uma pessoa e pausas obrigatórias entre envios que nem o operador consegue pular.
- Fluxo de Envio: ferramenta inclusa, sem custo adicional, para agendar e disparar uma mensagem em vários grupos ao mesmo tempo.
`;

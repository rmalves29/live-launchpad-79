# Live pelo TikTok e checkout pelo @

Dá para fazer. Esta tela já procura a cliente pelo @ no cadastro e junta as compras pelo telefone dela. Por isso, a versão TikTok usa a mesma lógica. Só muda o campo onde o sistema procura o @.

## 1. Menu Live com duas opções
- **Lançar pedidos Instagram**: a tela atual, sem nenhuma mudança.
- **Lançar pedidos TikTok**: uma cópia da tela, com os mesmos produtos, estoque, preço promocional e botão "Lançar".
  - O campo "Instagram Padrão" vira **"TikTok Padrão"**.
  - A coluna "Instagram" da lista de produtos vira **"TikTok"**.
  - A aba "Cadastrar Cliente" pede **telefone, nome e @ do TikTok**.
  - A aba "Pedidos Live" mostra os pedidos da live, como já mostra hoje.

## 2. Como funciona o "Lançar" no TikTok
- A loja digita o @ do TikTok da cliente. O sistema procura esse @ no cadastro de clientes.
- Se a cliente não estiver cadastrada, aparece o mesmo aviso de hoje: "Cliente não encontrado no cadastro". A loja cadastra pela aba "Cadastrar Cliente" e lança de novo.
- O bloqueio de clientes e a baixa de estoque continuam iguais.
- **Um pedido só:** se a mesma cliente comprar na live do Instagram e na do TikTok no mesmo dia, tudo vai para o mesmo pedido, com um frete e um pagamento.

## 3. Cadastro de clientes
- Novo campo **"@ do TikTok"** no cadastro e na edição de clientes, ao lado do Instagram.
- Dá para buscar clientes pelo @ do TikTok.
- Um mesmo @ do TikTok não pode estar em duas clientes da mesma loja.

## 4. Checkout: abrir pelo telefone, Instagram ou TikTok
- No começo do checkout, a cliente escolhe como quer buscar: **Telefone**, **@ do Instagram** ou **@ do TikTok**.
- Com qualquer uma das três opções, aparecem os pedidos em aberto dela.
- Pelo @, o sistema encontra a cliente no cadastro e mostra os pedidos do telefone cadastrado.
- **Quando ela entra pelo @**, o checkout não preenche os dados salvos sozinho, e ela precisa digitar:
  - **Telefone**: obrigatório.
  - **E-mail**: obrigatório.
  - **Endereço completo**: obrigatório (CEP, rua, número, bairro, cidade e estado).
  - **@ do Instagram**: opcional.
  - Continuam obrigatórios, como hoje: nome, CPF e escolha do frete.
- **Quando ela entra pelo telefone**, o checkout continua exatamente como é hoje.
- O checkout não preenche os dados salvos quando a cliente entra pelo @ porque é fácil descobrir o @ de alguém. Assim, quem digitar o @ de outra pessoa não vê o endereço dela.
- Se o @ não estiver cadastrado, aparece a mensagem: "Não encontramos esse @. Tente pelo telefone."

## O que não muda
- A tela de live do Instagram, a fila de espera, os comentários automáticos do Instagram, o cadastro público pelo Instagram e os pagamentos.

## Seção técnica
- **Banco:** colunas `customers.tiktok` e `carts.customer_tiktok`, com valor guardado sem @. Índice único parcial `(tenant_id, lower(tiktok))` quando o campo estiver preenchido.
- **Tela:** `src/pages/pedidos/Live.tsx` recebe a prop `platform: 'instagram' | 'tiktok'`, que define rótulos, a coluna de busca (`instagram` ou `tiktok`) e a coluna do carrinho. A busca do TikTok não diferencia maiúsculas de minúsculas. Agrupamento por telefone, data e `event_type 'LIVE'` mantido (um pedido só). Nova rota `/live-tiktok` com os mesmos guards de `/live`. Dois itens no grupo Live do `AppSidebar.tsx`.
- **Clientes:** campo TikTok em `src/pages/clientes/Index.tsx`, no formulário e na busca.
- **Checkout:** `public-checkout-orders` aceita `lookup_type: 'phone' | 'instagram' | 'tiktok'` e `handle`. Ele resolve a cliente da loja por `lower()` do @ e depois busca os pedidos pelo telefone cadastrado, reaproveitando a busca atual. Para o @, ele não devolve endereço. `PublicCheckout.tsx` ganha seletor de busca, um campo de telefone editável e e-mail e endereço obrigatórios no modo @. O telefone digitado é gravado nos pedidos não pagos (pedidos pagos continuam imutáveis).
- **Testes:** normalização do @, resolução por Instagram/TikTok, campos obrigatórios no modo @ e regra de um pedido só.
- Nada publicado sem o seu ok.

# Meta App Review — Instagram (OrderZap, app 964378056246313)

Reprovações anteriores (13/03, 28/03, 02/04 e 11/08/2026): vídeo não mostra o fluxo completo.
Permissões a reenviar: `instagram_business_manage_comments` e `instagram_business_manage_messages`
(`instagram_business_basic` e `instagram_basic` já estão aprovadas).

## Antes de gravar

- Conta que vai gravar: a conta Instagram da Mania de Mulher (a função só libera esta empresa).
- Uma **segunda conta de Instagram** (a "cliente de teste") logada no **celular**, para comentar e receber a mensagem.
  Ela precisa ser **testadora do app** (Meta > Funções do app > Funções), senão o app em modo de acesso padrão não enxerga os comentários dela.
- Instagram do celular em **inglês**. Painel do sistema traduzido pelo Google Tradutor (Chrome > traduzir para inglês) durante a gravação.
- Gravar a tela do computador inteira + o celular filmado ou espelhado (a Meta quer ver "o app" e "o Instagram nativo").
- Ter uma postagem normal (não live) publicada na conta para usar no teste.
- Falar ou legendar em inglês cada passo (a Meta pede legendas/dicas explicando os botões).

## Roteiro do vídeo (um vídeo só serve para as duas permissões)

**Cena 1 — Login completo da Meta (mostrar a conexão)**
1. Painel do OrderZap > Integrações > Instagram > Configuração.
2. Se já estiver conectado, clicar em Desconectar e depois **Conectar Instagram**.
3. Mostrar a tela de login do Instagram, a tela de **permissões** listando "gerenciar comentários" e "gerenciar mensagens", e clicar **Permitir**.
4. Voltar ao painel mostrando a conta conectada (`@usuario` visível). Isso é a "seleção do ativo".

**Cena 2 — Comentários (permission `instagram_business_manage_comments`)**
1. Integrações > Instagram > Live > aba **Todos os Comentários**. Mostrar o `@usuario` da conta e a lista de postagens.
2. Na postagem de teste, clicar **Comentar nesta postagem**, digitar "Test comment from OrderZap" e enviar → mostrar o aviso verde.
3. Abrir a postagem no Instagram (celular ou navegador) e mostrar o comentário publicado.
4. Com a conta de teste, comentar na mesma postagem ("I want C123"). Voltar ao painel, **Atualizar**, mostrar o comentário chegando.
5. Clicar **Responder** nesse comentário, digitar "Thanks! Check your DM" → mostrar no Instagram a resposta publicada.
6. Clicar **Ocultar** no comentário → mostrar o selo "Oculto" no painel e, no Instagram, que o comentário sumiu para os outros.
   Clicar **Mostrar** → ele volta. (É a edição de visibilidade; a API do Instagram não permite alterar o texto de um comentário.)
7. Clicar **Excluir** no comentário de teste → mostrar no Instagram que ele foi removido. Estado final da postagem à vista.

**Cena 3 — Mensagem (permission `instagram_business_manage_messages`)**

*3A — Automático (o fluxo real do sistema, em post comum, não live)*
1. Ter um produto cadastrado com código (ex.: C124) e o pedido por comentário ativo.
2. Com a conta de teste, comentar na postagem: "C124". Mostrar o comentário no Instagram do celular.
3. No painel (Todos os Comentários / Pedidos), mostrar o comentário sendo lido e o pedido criado sozinho.
4. Abrir o **Direct no celular da conta de teste** e mostrar a mensagem automática recebida (registro ou link de pagamento).

*3B — Manual (mostra a ação a partir da tela do app)*
1. Com a conta de teste, comentar de novo na postagem ("I want C125"). **Atualizar** no painel.
2. No comentário, clicar **Enviar mensagem (Direct)**, digitar "Hi! Here is your order link" e enviar → aviso verde.
3. Abrir o **Direct no celular da conta de teste** e mostrar a mensagem recebida, com o texto igual ao digitado.

Dica: faça a Cena 2 e 3 em sequência sem cortes, com a mão/cursor sempre visível.

## Texto para as observações do envio (inglês)

> OrderZap is a comment-to-private-message sales automation for Brazilian small businesses. Merchants connect their Instagram
> professional account; when a customer comments a product code on a post (or during a Live), our system reads the comment,
> creates the order and sends the customer one private message with the checkout link. The screencast demonstrates the flow on a
> regular post; the same flow applies to Instagram Lives.
>
> **instagram_business_manage_comments** — The merchant uses our dashboard (Integrations > Instagram > Live > All Comments) to
> read the comments on the account's posts and Lives, publish a comment, reply to a customer's comment, hide/unhide a comment
> and delete a comment. The screencast shows the full loop: login with Instagram and permission grant, publishing a comment
> from the app, a customer comment arriving in the dashboard, reply, hide/unhide, and delete, each confirmed in the native
> Instagram app. Note: the Instagram API does not allow editing the text of an existing comment, so "edit" is demonstrated
> with the hide/unhide moderation action.
>
> **instagram_business_manage_messages** — After a customer comments a product code, the merchant (or the system automatically)
> sends one private reply (message sent to the commenter's comment_id) with the order or registration link. The screencast shows
> the connected account (asset) selected in the app, a message typed and sent from the app UI, and the same message delivered
> in the Instagram Direct of the customer's native app.
>
> Our server calls the Instagram API with the merchant's long-lived Instagram token obtained through the Instagram Login flow
> shown at the start of the video. No data is used for advertising or sold to third parties.

## Depois da aprovação

- Liberar a função `instagram-post-comments` para todas as empresas (hoje só a Mania de Mulher: constante `MANIA_DE_MULHER_TENANT_ID`).
- Bloquear pedido gerado por comentário da própria conta da loja (`isOwnerCommenting` em `instagram-webhook`).

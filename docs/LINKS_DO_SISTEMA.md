# Links do Sistema — OrderZap / Cartzy

Índice de todas as rotas do sistema. A versão interativa está em `/admin/links` (restrita a super admin).

## Público / Institucional
- `/landing` — Landing institucional Cartzy.
- `/fluxo-envio` — Landing pública do Fluxo de Envio (trial + cadastro).
- `/auth` — Login e cadastro principal.
- `/reset-password` — Recuperação de senha.
- `/politica-de-privacidade` — Política de privacidade.
- `/termos-de-uso` — Termos de uso.

## Operação — Pedidos e Vendas
- `/pedidos` — Listagem e gestão de pedidos.
- `/pedidos-manual` — Criação manual de pedido.
- `/live` — Lançador de vendas em live.
- `/sorteio` — Sorteio ponderado por faturamento.
- `/fila-espera` — Fila para produtos esgotados.
- `/checkout` — Checkout interno.

## Cadastros
- `/produtos` — Catálogo (produtos pai + variações).
- `/clientes` — Base de clientes.
- `/etiquetas` — Etiquetas de envio.
- `/relatorios` — KPIs e ranking RFM.

## Comunicação
- `/sendflow` — Envio em massa.
- `/fluxo-envio/painel` — Painel de campanhas/grupos/automações.
- `/comunicacao/push` — Web Push.
- `/whatsapp/zapi` — Conexão Z-API/uazapi.
- `/whatsapp/oficial` — API Meta (restrito ao tenant `orderzap`).
- `/whatsapp/templates` — Templates de mensagem.
- `/whatsapp/cobranca` — Cobrança em massa.
- `/whatsapp/envios-ativos` — Monitor de jobs.

## Sistema
- `/integracoes` — Frete, pagamento, ERP, Instagram.
- `/config` — Configurações do tenant.
- `/empresas` — Gestão de tenants (super admin).
- `/renovar-assinatura` — Renovação Cartzy.
- `/fluxo-envio/pagamento` — Planos Fluxo de Envio.
- `/ajuda` — Central de ajuda (super admin).
- `/agente-ia` — Assistente IA.
- `/suporte-ia` — Suporte IA híbrido.

## Super Admin
- `/admin/links` — Índice de links (esta página).
- `/admin/tutoriais` — Central de tutoriais.
- `/admin/comunicados` — Pop-ups globais.
- `/admin/monitoramento-mensagens` — Monitor de WhatsApp.
- `/admin/saude` — Saúde do sistema.
- `/admin/arquivo-historico` — Arquivo histórico.
- `/admin/erros` — Sentry (restrito a rafael@maniadmulher.com).
- `/debug` — Ferramentas de debug.
- `/design-preview` — Preview de design.

## Rotas Públicas por Tenant
- `/t/:slug` — Storefront público.
- `/t/:slug/checkout` — Checkout público.
- `/t/:slug/cadastro-instagram` — Cadastro via DM.
- `/t/:slug/push` — Opt-in de push.
- `/fluxo/:tenantSlug/:campaignSlug` — Redirecionador de campanhas.
- `/pagamento/retorno` — Retorno universal dos gateways.
- `/mp/callback` — OAuth callback Mercado Pago.

## Ferramentas Externas
- [Supabase Dashboard](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx)
- [Lovable Cloud](https://lovable.dev/projects/154035f9-093b-4aed-ac82-a01434f3c19b)

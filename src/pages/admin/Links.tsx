import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

type LinkItem = {
  path: string;
  label: string;
  description: string;
  access?: string;
  external?: boolean;
};

type Group = { title: string; items: LinkItem[] };

const groups: Group[] = [
  {
    title: "Público / Institucional",
    items: [
      { path: "/landing", label: "Landing Cartzy", description: "Página institucional pública do sistema Cartzy." },
      { path: "/fluxo-envio", label: "Landing Fluxo de Envio", description: "Landing pública do produto Fluxo de Envio (trial + cadastro)." },
      { path: "/auth", label: "Login / Cadastro", description: "Autenticação principal do sistema." },
      { path: "/reset-password", label: "Redefinir Senha", description: "Fluxo de recuperação de senha via e-mail." },
      { path: "/politica-de-privacidade", label: "Política de Privacidade", description: "Documento legal público." },
      { path: "/termos-de-uso", label: "Termos de Uso", description: "Documento legal público." },
    ],
  },
  {
    title: "Operação — Pedidos e Vendas",
    items: [
      { path: "/pedidos", label: "Pedidos", description: "Listagem e gestão de todos os pedidos do tenant." },
      { path: "/pedidos-manual", label: "Pedido Manual", description: "Criação manual de pedido no admin." },
      { path: "/live", label: "Live", description: "Lançador de vendas em live (Instagram / WhatsApp)." },
      { path: "/sorteio", label: "Sorteio", description: "Sorteio ponderado por faturamento entre clientes." },
      { path: "/fila-espera", label: "Fila de Espera", description: "Fila para produtos esgotados; consolida em pedido aberto do dia." },
      { path: "/checkout", label: "Checkout (interno)", description: "Checkout usado pelo fluxo administrativo." },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { path: "/produtos", label: "Produtos", description: "Catálogo com produtos pai e variações (P/M/G etc.)." },
      { path: "/clientes", label: "Clientes", description: "Base de clientes, bloqueios, e-mail e histórico." },
      { path: "/etiquetas", label: "Etiquetas", description: "Impressão e geração de etiquetas de envio." },
      { path: "/relatorios", label: "Relatórios", description: "KPIs, gráficos e ranking RFM." },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { path: "/sendflow", label: "SendFlow", description: "Envio em massa de mensagens/produtos via WhatsApp." },
      { path: "/fluxo-envio/painel", label: "Fluxo de Envio (Painel)", description: "Painel de campanhas, grupos, automações e relatórios." },
      { path: "/comunicacao/push", label: "Push", description: "Notificações Web Push para clientes." },
      { path: "/whatsapp/zapi", label: "WhatsApp — Conexão Z-API/uazapi", description: "QR Code e status da conexão." },
      { path: "/whatsapp/oficial", label: "WhatsApp Oficial (Meta)", description: "Integração com API oficial (restrito a orderzap).", access: "orderzap" },
      { path: "/whatsapp/templates", label: "Templates WhatsApp", description: "Templates de mensagens com variáveis dinâmicas." },
      { path: "/whatsapp/cobranca", label: "Cobrança em Massa", description: "Disparo de cobranças de pedidos em aberto." },
      { path: "/whatsapp/envios-ativos", label: "Envios Ativos", description: "Monitor de jobs de envio em andamento." },
    ],
  },
  {
    title: "Sistema",
    items: [
      { path: "/integracoes", label: "Integrações", description: "Frete, pagamento, ERP, Instagram etc." },
      { path: "/config", label: "Configurações", description: "Configurações do tenant (abas por role)." },
      { path: "/empresas", label: "Empresas", description: "Gestão de tenants — abas Cartzy e Fluxo de Envio.", access: "super_admin" },
      { path: "/renovar-assinatura", label: "Renovar Assinatura", description: "Renovação de assinatura Cartzy." },
      { path: "/fluxo-envio/pagamento", label: "Pagamento Fluxo de Envio", description: "Planos R$ 49,90 / 69,90 / 89,90 para usuários do Fluxo." },
      { path: "/ajuda", label: "Central de Ajuda", description: "Ajuda contextual do sistema.", access: "super_admin" },
      { path: "/agente-ia", label: "Agente IA", description: "Assistente IA integrado." },
      { path: "/suporte-ia", label: "Suporte IA", description: "Chat de suporte com IA híbrida." },
    ],
  },
  {
    title: "Super Admin",
    items: [
      { path: "/admin/links", label: "Links do Sistema", description: "Esta página — índice geral de rotas.", access: "super_admin" },
      { path: "/admin/tutoriais", label: "Tutoriais", description: "Central de vídeos e tutoriais.", access: "super_admin" },
      { path: "/admin/comunicados", label: "Comunicados", description: "Criação de pop-ups globais para todos os tenants.", access: "super_admin" },
      { path: "/admin/monitoramento-mensagens", label: "Monitoramento WhatsApp", description: "Monitor técnico de mensagens/webhooks.", access: "super_admin" },
      { path: "/admin/saude", label: "Saúde do Sistema", description: "Dashboard operacional (system-health-check).", access: "super_admin" },
      { path: "/admin/arquivo-historico", label: "Arquivo / Histórico", description: "Arquivo histórico de eventos.", access: "super_admin" },
      { path: "/admin/erros", label: "Monitor de Erros", description: "Painel do Sentry.", access: "rafael@maniadmulher.com" },
      { path: "/debug", label: "Debug", description: "Ferramentas internas de debug.", access: "super_admin" },
      { path: "/design-preview", label: "Design Preview", description: "Preview de componentes de design." },
    ],
  },
  {
    title: "Rotas Públicas por Tenant",
    items: [
      { path: "/t/:slug", label: "Storefront do Tenant", description: "Vitrine pública do tenant." },
      { path: "/t/:slug/checkout", label: "Checkout Público", description: "Checkout público do tenant." },
      { path: "/t/:slug/cadastro-instagram", label: "Cadastro Instagram", description: "Captura de dados via DM do Instagram." },
      { path: "/t/:slug/push", label: "Opt-in Push", description: "Página pública de opt-in de notificações." },
      { path: "/fluxo/:tenantSlug/:campaignSlug", label: "Redirecionador de Campanha", description: "Fast-path para redirecionar cliques em campanhas de grupo." },
      { path: "/pagamento/retorno", label: "Retorno de Pagamento", description: "Página universal de retorno dos gateways." },
      { path: "/mp/callback", label: "Callback Mercado Pago", description: "OAuth callback do MP." },
    ],
  },
  {
    title: "Ferramentas Externas",
    items: [
      { path: "https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx", label: "Supabase Dashboard", description: "Banco de dados, edge functions e logs.", external: true, access: "super_admin" },
      { path: "https://lovable.dev/projects/154035f9-093b-4aed-ac82-a01434f3c19b", label: "Lovable Cloud", description: "Painel do projeto na Lovable.", external: true, access: "super_admin" },
    ],
  },
];

export default function AdminLinks() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[#111827]">Links do Sistema</h1>
        <p className="text-[#6b7280] mt-2">
          Índice completo das rotas do OrderZap / Cartzy — descrição de cada página e nível de acesso.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {groups.map((group) => (
          <Card key={group.title} className="p-5">
            <h2 className="text-lg font-bold text-[#111827] mb-4">{group.title}</h2>
            <ul className="space-y-3">
              {group.items.map((item) => (
                <li key={item.path} className="border-b border-[#f3f4f6] pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {item.external ? (
                        <a
                          href={item.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#4f46e5] font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          {item.label} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : item.path.includes(":") ? (
                        <span className="text-[#111827] font-semibold">{item.label}</span>
                      ) : (
                        <Link to={item.path} className="text-[#4f46e5] font-semibold hover:underline">
                          {item.label}
                        </Link>
                      )}
                      <div className="text-[13px] text-[#6b7280] mt-1">{item.description}</div>
                      <code className="text-[11px] text-[#9ca3af] font-mono">{item.path}</code>
                    </div>
                    {item.access && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {item.access}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

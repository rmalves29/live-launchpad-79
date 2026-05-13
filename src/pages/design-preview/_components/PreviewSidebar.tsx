import { ShoppingCart, Plus, Package, Users, BarChart3, Send, Tag, MessageCircle, Settings, Zap, Sparkles, Radio } from "lucide-react";

const items = [
  { icon: ShoppingCart, label: "Pedidos", active: true },
  { icon: Plus, label: "Pedido Manual" },
  { icon: Radio, label: "Live" },
  { icon: Package, label: "Produtos" },
  { icon: Users, label: "Clientes" },
  { icon: BarChart3, label: "Relatórios" },
  { icon: Send, label: "SendFlow" },
  { icon: Tag, label: "Etiquetas" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Sparkles, label: "Agente IA" },
  { icon: Settings, label: "Configurações" },
];

export function PreviewSidebar({ current, onChange }: { current: "pedidos" | "manual"; onChange: (v: "pedidos" | "manual") => void }) {
  return (
    <aside className="w-64 bg-white border-r border-[#e5e7eb] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-[#e5e7eb] flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold text-[#111827] text-[15px] leading-tight">OrderZap</div>
          <div className="text-[11px] text-[#6b7280]">Gestão de pedidos</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const isActive = (it.label === "Pedidos" && current === "pedidos") || (it.label === "Pedido Manual" && current === "manual");
          return (
            <button
              key={it.label}
              onClick={() => {
                if (it.label === "Pedidos") onChange("pedidos");
                if (it.label === "Pedido Manual") onChange("manual");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                isActive
                  ? "bg-[#eef2ff] text-[#4f46e5]"
                  : "text-[#4b5563] hover:bg-[#f9fafb]"
              }`}
            >
              <it.icon className="w-[18px] h-[18px]" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="m-3 p-4 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4" />
          <span className="text-[12px] font-semibold tracking-wide">PRO</span>
        </div>
        <div className="text-[13px] font-medium leading-snug mb-2">Plano ativo até 12/06/2026</div>
        <button className="w-full text-[12px] bg-white/15 hover:bg-white/25 transition rounded-md py-1.5 font-medium">
          Gerenciar plano
        </button>
      </div>
    </aside>
  );
}

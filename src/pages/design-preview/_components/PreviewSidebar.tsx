import { ShoppingBag, Package, Users, BarChart3 } from "lucide-react";

export function PreviewSidebar({ current, onChange }: { current: "pedidos" | "manual"; onChange: (v: "pedidos" | "manual") => void }) {
  return (
    <aside style={{ width: 220, flexShrink: 0 }} className="bg-white border-r border-[#e5e7eb] flex flex-col h-screen sticky top-0 overflow-y-auto">
      <div className="p-4 border-b border-[#f3f4f6]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#4f46e5] rounded-lg flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-[#111827]">Cartzy</span>
        </div>
        <div className="mt-3 flex items-center gap-2 p-2 bg-[#f9fafb] rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[#e0e7ff] flex items-center justify-center text-[11px] font-bold text-[#4f46e5]">FL</div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#374151] truncate">FL Semi Joias</p>
            <p className="text-[11px] text-[#9ca3af] truncate">rafael@email.com</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2">
        <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider px-3 pt-3 pb-1">Principal</div>

        <button
          onClick={() => onChange("pedidos")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${
            current === "pedidos" ? "bg-[#eef2ff] text-[#4f46e5] font-semibold" : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Pedidos
        </button>
        <button
          onClick={() => onChange("manual")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${
            current === "manual" ? "bg-[#eef2ff] text-[#4f46e5] font-semibold" : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Pedido Manual
        </button>

        {[
          { label: "Produtos", icon: Package },
          { label: "Clientes", icon: Users },
          { label: "Relatórios", icon: BarChart3 },
        ].map((it) => (
          <div key={it.label} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#9ca3af] cursor-not-allowed">
            <it.icon className="w-4 h-4" />
            {it.label}
            <span className="ml-auto text-[11px]">(em breve)</span>
          </div>
        ))}

        <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider px-3 pt-4 pb-1">Outras páginas</div>
        <div className="px-3 py-2 text-[11px] text-[#9ca3af] leading-snug">
          Produtos, Clientes, Config, WhatsApp, Etiquetas, Sorteio, Empresas — próximas páginas do mockup
        </div>
      </nav>

      <div className="p-3 border-t border-[#f3f4f6]">
        <div className="bg-[#eef2ff] rounded-lg p-3 text-[12px] text-[#4338ca]">
          <strong>Mockup — Página 1/11</strong>
          <br />
          Testando: Pedidos
        </div>
      </div>
    </aside>
  );
}

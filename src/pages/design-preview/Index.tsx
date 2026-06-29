import { useState } from "react";
import { PreviewSidebar } from "./_components/PreviewSidebar";
import { PedidosPreview } from "./_components/PedidosPreview";
import { ManualPreview } from "./_components/ManualPreview";
import { EditOrderModalPreview } from "./_components/EditOrderModalPreview";

export default function DesignPreview() {
  const [view, setView] = useState<"pedidos" | "manual">("pedidos");
  const [modal, setModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#f9fafb] flex" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <PreviewSidebar current={view} onChange={setView} />
      <main className="flex-1 min-w-0">
        <div className="bg-[#fffbeb] border-b border-[#fde68a] px-8 py-2.5 text-[13px] text-[#92400e] flex items-center justify-between">
          <span>🎨 <strong>Modo preview</strong> — esta é uma página de teste isolada com dados fictícios. Nada do sistema atual foi alterado.</span>
          <button onClick={() => setView(view === "pedidos" ? "manual" : "pedidos")} className="text-[#92400e] underline font-medium">
            Alternar para {view === "pedidos" ? "Pedido Manual" : "Pedidos"}
          </button>
        </div>
        {view === "pedidos" ? <PedidosPreview onEdit={() => setModal(true)} /> : <ManualPreview />}
      </main>
      <EditOrderModalPreview open={modal} onClose={() => setModal(false)} />
    </div>
  );
}

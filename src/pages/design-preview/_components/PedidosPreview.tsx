import { Search, Filter, Download, Plus, Eye, Pencil, MoreVertical, ShoppingBag, DollarSign, Clock, CheckCircle2 } from "lucide-react";

const stats = [
  { label: "Pedidos hoje", value: "47", delta: "+12%", icon: ShoppingBag, color: "#4f46e5", bg: "#eef2ff" },
  { label: "Faturamento", value: "R$ 8.420", delta: "+8%", icon: DollarSign, color: "#16a34a", bg: "#dcfce7" },
  { label: "Pendentes", value: "12", delta: "-3", icon: Clock, color: "#ea580c", bg: "#ffedd5" },
  { label: "Pagos", value: "35", delta: "+15", icon: CheckCircle2, color: "#0891b2", bg: "#cffafe" },
];

const orders = [
  { n: "#1247", cliente: "Maria Silva", whats: "(11) 98765-4321", itens: 3, total: "R$ 245,90", status: "pago", data: "13/05 14:32" },
  { n: "#1246", cliente: "Ana Paula Costa", whats: "(21) 99876-5432", itens: 1, total: "R$ 89,00", status: "pendente", data: "13/05 14:18" },
  { n: "#1245", cliente: "Juliana Santos", whats: "(11) 97654-3210", itens: 5, total: "R$ 478,50", status: "pago", data: "13/05 13:55" },
  { n: "#1244", cliente: "Carla Mendes", whats: "(31) 96543-2109", itens: 2, total: "R$ 156,00", status: "enviado", data: "13/05 13:40" },
  { n: "#1243", cliente: "Patrícia Lima", whats: "(11) 95432-1098", itens: 4, total: "R$ 312,80", status: "pago", data: "13/05 13:12" },
  { n: "#1242", cliente: "Renata Souza", whats: "(47) 94321-0987", itens: 1, total: "R$ 67,90", status: "cancelado", data: "13/05 12:55" },
];

const statusStyle: Record<string, string> = {
  pago: "bg-[#dcfce7] text-[#16a34a]",
  pendente: "bg-[#fef3c7] text-[#b45309]",
  enviado: "bg-[#dbeafe] text-[#2563eb]",
  cancelado: "bg-[#fee2e2] text-[#dc2626]",
};

export function PedidosPreview({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-[#111827] leading-tight">Pedidos</h1>
          <p className="text-[14px] text-[#6b7280] mt-1">Gerencie todos os pedidos da sua loja em um só lugar</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#e5e7eb] bg-white text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb]">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#4f46e5] text-white text-[14px] font-medium hover:bg-[#4338ca]">
            <Plus className="w-4 h-4" /> Novo pedido
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13px] text-[#6b7280] font-medium">{s.label}</div>
                <div className="text-[26px] font-semibold text-[#111827] mt-1.5">{s.value}</div>
                <div className="text-[12px] text-[#16a34a] mt-1 font-medium">{s.delta} vs ontem</div>
              </div>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              placeholder="Buscar por nome, telefone ou nº do pedido..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px] focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px] text-[#374151] hover:bg-[#f9fafb]">
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <select className="px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px] text-[#374151] bg-white">
            <option>Todos os status</option>
            <option>Pagos</option>
            <option>Pendentes</option>
          </select>
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] font-medium text-[#6b7280] uppercase tracking-wider bg-[#f9fafb]">
              <th className="px-5 py-3">Pedido</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Itens</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Data</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.n} className="border-t border-[#f3f4f6] hover:bg-[#f9fafb]">
                <td className="px-5 py-3.5 font-medium text-[#4f46e5] text-[14px]">{o.n}</td>
                <td className="px-5 py-3.5">
                  <div className="text-[14px] font-medium text-[#111827]">{o.cliente}</div>
                  <div className="text-[12px] text-[#6b7280]">{o.whats}</div>
                </td>
                <td className="px-5 py-3.5 text-[14px] text-[#374151]">{o.itens}</td>
                <td className="px-5 py-3.5 text-[14px] font-semibold text-[#111827]">{o.total}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-medium capitalize ${statusStyle[o.status]}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#6b7280]">{o.data}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button className="p-1.5 rounded-md hover:bg-[#f3f4f6] text-[#6b7280]"><Eye className="w-4 h-4" /></button>
                    <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-[#f3f4f6] text-[#6b7280]"><Pencil className="w-4 h-4" /></button>
                    <button className="p-1.5 rounded-md hover:bg-[#f3f4f6] text-[#6b7280]"><MoreVertical className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-between text-[13px] text-[#6b7280]">
          <div>Mostrando 1-6 de 247 pedidos</div>
          <div className="flex gap-1">
            <button className="px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb]">Anterior</button>
            <button className="px-3 py-1.5 rounded-md bg-[#4f46e5] text-white">1</button>
            <button className="px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb]">2</button>
            <button className="px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb]">3</button>
            <button className="px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb]">Próximo</button>
          </div>
        </div>
      </div>
    </div>
  );
}

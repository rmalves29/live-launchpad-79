import { useState } from "react";
import {
  Search, Filter, Printer, Check, XCircle, Trash2, Download,
  MessageCircle, DollarSign, Pencil, Eye,
} from "lucide-react";

type Order = {
  id: string;
  telefone: string;
  multi?: number;
  total: string;
  pago: boolean;
  status: "pago" | "pendente" | "cancelado";
  impresso: boolean;
  evento: "LIVE" | "Bazar";
  dataEvento: string;
  rastreio?: string;
  obs?: string;
};

const initialOrders: Order[] = [
  { id: "7035", telefone: "(32) 98402-6446", total: "R$ 134,60", pago: true, status: "pago", impresso: true, evento: "LIVE", dataEvento: "09/05/2026", rastreio: "AA123456789BR", obs: "[FRETE] Envio Fedex Express" },
  { id: "7034", telefone: "(19) 99720-3848", multi: 2, total: "R$ 29,90", pago: true, status: "pago", impresso: false, evento: "LIVE", dataEvento: "09/05/2026", obs: "CLIENTE INFORMOU ENTREGA EM MÃO" },
  { id: "7033", telefone: "(11) 97654-3210", total: "R$ 478,50", pago: false, status: "pendente", impresso: false, evento: "LIVE", dataEvento: "09/05/2026", obs: "Aguardando confirmação do PIX" },
  { id: "7032", telefone: "(31) 96543-2109", total: "R$ 89,00", pago: true, status: "pago", impresso: true, evento: "Bazar", dataEvento: "08/05/2026", rastreio: "BR987654321AA", obs: "[FRETE] Sedex 2 dias úteis" },
  { id: "7031", telefone: "(47) 94321-0987", total: "R$ 67,90", pago: false, status: "cancelado", impresso: false, evento: "LIVE", dataEvento: "08/05/2026", obs: "Cliente desistiu da compra" },
  { id: "7030", telefone: "(11) 95432-1098", multi: 3, total: "R$ 312,80", pago: true, status: "pago", impresso: false, evento: "Bazar", dataEvento: "07/05/2026", rastreio: "CC555666777BR", obs: "Embalar com cuidado, é frágil" },
];

const eventoBadge: Record<string, string> = {
  LIVE: "bg-[#dbeafe] text-[#2563eb]",
  Bazar: "bg-[#f3e8ff] text-[#9333ea]",
};

const pagoBadge: Record<string, string> = {
  pago: "bg-[#dcfce7] text-[#16a34a]",
  pendente: "bg-[#fef9c3] text-[#ca8a04]",
  cancelado: "bg-[#fee2e2] text-[#dc2626]",
};

const pagoLabel: Record<string, string> = { pago: "Pago", pendente: "Pendente", cancelado: "Cancelado" };

export function PedidosPreview({ onEdit }: { onEdit: () => void }) {
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodo, setPeriodo] = useState("mes");

  const toggleSel = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
  };
  const togglePago = (id: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, pago: !o.pago, status: !o.pago ? "pago" : "pendente" } : o)));
  };
  const toggleImpresso = (id: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, impresso: !o.impresso } : o)));
  };

  const periodos = [
    { k: "hoje", l: "Hoje" }, { k: "semana", l: "Semana" }, { k: "mes", l: "Mês" },
    { k: "ano", l: "Ano" }, { k: "periodo", l: "Período" },
  ];

  const selCount = selected.size;

  return (
    <div className="p-6 max-w-full">
      {/* HEADER */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-[#111827]">Gestão de Pedidos</h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">
            Live de Sábado — 09/05/2026 · <span className="font-medium text-[#374151]">FL Semi Joias</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f9fafb]">
            <Printer className="w-3.5 h-3.5" /> Imprimir Selecionados ({selCount})
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f9fafb]">
            <Check className="w-3.5 h-3.5" /> Marcar como Impresso
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#fed7aa] text-[13px] text-[#ea580c] hover:bg-[#fff7ed]">
            <XCircle className="w-3.5 h-3.5" /> Cancelar Selecionados ({selCount})
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#fca5a5] text-[13px] text-[#dc2626] hover:bg-[#fef2f2]">
            <Trash2 className="w-3.5 h-3.5" /> Deletar Selecionados ({selCount})
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f9fafb]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[#6b7280]" />
          <span className="text-[13px] font-semibold text-[#374151]">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              placeholder="Buscar por telefone..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10"
            />
          </div>
          <select className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] bg-white">
            <option>Status Pagamento — Todos</option>
            <option>Pago</option>
            <option>Pendente</option>
            <option>Cancelado</option>
          </select>
          <select className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] bg-white">
            <option>Tipo do Evento — Todos</option>
            <option>LIVE</option>
            <option>Bazar</option>
          </select>
          <button className="px-3.5 py-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f9fafb]">
            Limpar Filtros
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[12px] text-[#6b7280] font-medium">Período:</span>
          {periodos.map((p) => (
            <button
              key={p.k}
              onClick={() => setPeriodo(p.k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border whitespace-nowrap ${
                periodo === p.k ? "bg-[#4f46e5] text-white border-[#4f46e5]" : "bg-white text-[#6b7280] border-[#e5e7eb] hover:bg-[#f9fafb]"
              }`}
            >
              {p.l}
            </button>
          ))}
          <input type="date" defaultValue="2026-05-09" className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151]" />
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa] border-b border-[#e5e7eb]">
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.size === orders.length && orders.length > 0}
                    onChange={toggleAll}
                    className="w-[15px] h-[15px] accent-[#4f46e5] cursor-pointer"
                  />
                </th>
                {["#Pedido", "Telefone", "Total", "Pago?", "Impresso?", "Tipo Evento", "Data Evento", "Disparo", "Rastreio", "Observação", "Ações"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isSel = selected.has(o.id);
                return (
                  <tr key={o.id} className={`border-b border-[#f3f4f6] ${isSel ? "bg-[#eef2ff] hover:bg-[#e0e7ff]" : "hover:bg-[#fafafa]"}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSel(o.id)}
                        className="w-[15px] h-[15px] accent-[#4f46e5] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#6b7280] font-semibold">#{o.id}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-[#1f2937] text-[13px]">{o.telefone}</span>
                        {o.multi && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#ffedd5] text-[#ea580c]">
                            {o.multi} pedidos
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[#1f2937] text-[13px]">{o.total}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePago(o.id)}
                          className="relative w-10 h-[22px] rounded-full transition-colors"
                          style={{ background: o.pago ? "#16a34a" : "#d1d5db" }}
                        >
                          <span
                            className="absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: o.pago ? 21 : 3 }}
                          />
                        </button>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${pagoBadge[o.status]}`}>
                          {pagoLabel[o.status]}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className={`text-[12px] ${o.impresso ? "font-bold text-[#111827]" : "font-normal text-[#9ca3af]"}`}>
                          {o.impresso ? "Impresso" : "Não Impresso"}
                        </span>
                        <button onClick={() => toggleImpresso(o.id)} className="p-1 rounded text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${eventoBadge[o.evento]}`}>
                        {o.evento}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[#6b7280] whitespace-nowrap">{o.dataEvento}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button title="Enviar WhatsApp" className="p-1.5 rounded text-[#6b7280] hover:bg-[#dcfce7] hover:text-[#16a34a]">
                          <MessageCircle className="w-[15px] h-[15px]" />
                        </button>
                        <button title="Link de Pagamento" className="p-1.5 rounded text-[#ca8a04] hover:bg-[#fef9c3]">
                          <DollarSign className="w-[15px] h-[15px]" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {o.rastreio ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dbeafe] text-[#2563eb] cursor-pointer">
                          {o.rastreio.slice(0, 6)}...{o.rastreio.slice(-2)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#d1d5db]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[#6b7280] truncate" style={{ maxWidth: 140 }} title={o.obs}>
                      {o.obs}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button title="Imprimir" className="p-1.5 rounded text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]">
                          <Printer className="w-[15px] h-[15px]" />
                        </button>
                        <button onClick={onEdit} title="Editar" className="p-1.5 rounded text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]">
                          <Pencil className="w-[15px] h-[15px]" />
                        </button>
                        <button title="Visualizar" className="p-1.5 rounded text-[#6b7280] hover:bg-[#dbeafe] hover:text-[#2563eb]">
                          <Eye className="w-[15px] h-[15px]" />
                        </button>
                        <button title="Cancelar pedido" className="p-1.5 rounded text-[#ea580c] hover:bg-[#ffedd5]">
                          <XCircle className="w-[15px] h-[15px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

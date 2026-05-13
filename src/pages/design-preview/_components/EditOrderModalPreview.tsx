import { X, Plus, Minus, Trash2 } from "lucide-react";

export function EditOrderModalPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111827]">Editar pedido #1247</h2>
            <p className="text-[13px] text-[#6b7280]">Maria Silva · (11) 98765-4321</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f3f4f6] text-[#6b7280]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="text-[13px] font-medium text-[#374151] mb-2 block">Status</label>
            <select className="w-full px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]">
              <option>Pago</option>
              <option>Pendente</option>
              <option>Enviado</option>
              <option>Cancelado</option>
            </select>
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#374151] mb-2 block">Itens do pedido</label>
            <div className="border border-[#e5e7eb] rounded-lg divide-y divide-[#f3f4f6]">
              {[
                { name: "Biquíni Floral Rosa", price: 89.90, qty: 2 },
                { name: "Conjunto Tropical Verde", price: 199.00, qty: 1 },
              ].map((i, idx) => (
                <div key={idx} className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-[14px] font-medium text-[#111827]">{i.name}</div>
                    <div className="text-[12px] text-[#6b7280]">R$ {i.price.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6]">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-[14px] font-medium">{i.qty}</span>
                    <button className="w-7 h-7 rounded border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6]">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button className="ml-2 p-1.5 rounded text-[#dc2626] hover:bg-[#fee2e2]">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#374151] mb-2 block">Observações</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]"
              defaultValue="Cliente pediu para entregar no período da tarde."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#e5e7eb] text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb]">
            Cancelar
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-[14px] font-medium hover:bg-[#4338ca]">
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

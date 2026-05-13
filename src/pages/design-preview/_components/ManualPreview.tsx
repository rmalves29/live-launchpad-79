import { Search, Plus, Minus, Trash2, User, MapPin, CreditCard, Package } from "lucide-react";

const products = [
  { code: "C101", name: "Biquíni Floral Rosa", price: 89.90, stock: 12 },
  { code: "C102", name: "Saída de Praia Branca", price: 129.00, stock: 8 },
  { code: "C103", name: "Maiô Preto Decotado", price: 159.90, stock: 5 },
  { code: "C104", name: "Conjunto Tropical Verde", price: 199.00, stock: 15 },
];

const cart = [
  { code: "C101", name: "Biquíni Floral Rosa", price: 89.90, qty: 2 },
  { code: "C104", name: "Conjunto Tropical Verde", price: 199.00, qty: 1 },
];

export function ManualPreview() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const desconto = 17.89;
  const frete = 18.50;
  const total = subtotal - desconto + frete;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-[#111827] leading-tight">Pedido Manual</h1>
        <p className="text-[14px] text-[#6b7280] mt-1">Crie um novo pedido para o cliente em poucos cliques</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Esquerda - 2/3 */}
        <div className="col-span-2 space-y-5">
          {/* Cliente */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                <User className="w-4 h-4 text-[#4f46e5]" />
              </div>
              <h3 className="font-semibold text-[15px] text-[#111827]">Cliente</h3>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                placeholder="Buscar cliente por nome ou WhatsApp..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#e5e7eb] text-[14px] focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
              />
            </div>
            <div className="mt-3 p-3 rounded-lg bg-[#f9fafb] border border-[#e5e7eb] flex items-center justify-between">
              <div>
                <div className="text-[14px] font-medium text-[#111827]">Maria Silva Santos</div>
                <div className="text-[12px] text-[#6b7280]">(11) 98765-4321 · CPF 123.456.789-00</div>
              </div>
              <span className="text-[12px] text-[#16a34a] bg-[#dcfce7] px-2 py-0.5 rounded-full font-medium">Cliente VIP</span>
            </div>
          </div>

          {/* Produtos */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                <Package className="w-4 h-4 text-[#4f46e5]" />
              </div>
              <h3 className="font-semibold text-[15px] text-[#111827]">Adicionar produtos</h3>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                placeholder="Buscar por código ou nome..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#e5e7eb] text-[14px] focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
              />
            </div>
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.code} className="flex items-center justify-between p-3 rounded-lg border border-[#e5e7eb] hover:border-[#4f46e5]/40 hover:bg-[#f9fafb] transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-[#f3f4f6] flex items-center justify-center text-[11px] font-mono text-[#6b7280]">
                      {p.code}
                    </div>
                    <div>
                      <div className="text-[14px] font-medium text-[#111827]">{p.name}</div>
                      <div className="text-[12px] text-[#6b7280]">{p.stock} em estoque</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] font-semibold text-[#111827]">R$ {p.price.toFixed(2)}</span>
                    <button className="w-8 h-8 rounded-md bg-[#4f46e5] text-white flex items-center justify-center hover:bg-[#4338ca]">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Endereço */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                <MapPin className="w-4 h-4 text-[#4f46e5]" />
              </div>
              <h3 className="font-semibold text-[15px] text-[#111827]">Endereço de entrega</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input className="px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]" placeholder="CEP" defaultValue="01310-100" />
              <input className="col-span-2 px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]" placeholder="Rua" defaultValue="Av. Paulista" />
              <input className="px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]" placeholder="Número" defaultValue="1000" />
              <input className="col-span-2 px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px]" placeholder="Bairro" defaultValue="Bela Vista" />
            </div>
          </div>
        </div>

        {/* Direita - resumo */}
        <div className="col-span-1">
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 sticky top-6">
            <h3 className="font-semibold text-[15px] text-[#111827] mb-4">Resumo do pedido</h3>

            <div className="space-y-3 mb-4">
              {cart.map((i) => (
                <div key={i.code} className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-[#111827]">{i.name}</div>
                    <div className="text-[12px] text-[#6b7280]">R$ {i.price.toFixed(2)} cada</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="w-6 h-6 rounded border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6]">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-[13px] font-medium">{i.qty}</span>
                    <button className="w-6 h-6 rounded border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6]">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button className="ml-1 text-[#dc2626] hover:bg-[#fee2e2] p-1 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#e5e7eb] pt-4 space-y-2 text-[14px]">
              <div className="flex justify-between text-[#374151]">
                <span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#16a34a]">
                <span>Desconto PIX (5%)</span><span>- R$ {desconto.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#374151]">
                <span>Frete (PAC)</span><span>R$ {frete.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[16px] text-[#111827] pt-2 border-t border-[#e5e7eb]">
                <span>Total</span><span>R$ {total.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-[#374151]">
                <CreditCard className="w-4 h-4 text-[#6b7280]" />
                <span>Forma de pagamento</span>
              </div>
              <select className="w-full px-3 py-2 rounded-lg border border-[#e5e7eb] text-[14px] bg-white">
                <option>PIX (5% desconto)</option>
                <option>Cartão de crédito</option>
                <option>Boleto</option>
              </select>
            </div>

            <button className="w-full mt-4 py-2.5 rounded-lg bg-[#4f46e5] text-white text-[14px] font-medium hover:bg-[#4338ca]">
              Finalizar pedido
            </button>
            <button className="w-full mt-2 py-2.5 rounded-lg border border-[#e5e7eb] text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb]">
              Salvar rascunho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

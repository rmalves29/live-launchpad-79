import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MpReturn = () => {
  const [params] = useSearchParams();
  const status = (params.get("status") || "").toLowerCase();
  const preferenceId = params.get("preference_id");
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const messageMap: Record<string, { title: string; desc: string; tone: "success" | "warning" | "error" }> = {
    success: {
      title: "Pagamento aprovado",
      desc: "Obrigado! Seu pagamento foi confirmado com sucesso.",
      tone: "success",
    },
    failure: {
      title: "Pagamento não aprovado",
      desc: "Não conseguimos aprovar o pagamento. Tente novamente ou use outro método.",
      tone: "error",
    },
    pending: {
      title: "Pagamento pendente",
      desc: "Recebemos seu pedido e o pagamento está em análise.",
      tone: "warning",
    },
  };

  const info = messageMap[status] || {
    title: "Retorno de pagamento",
    desc: "Recebemos o retorno do Mercado Pago.",
    tone: "warning" as const,
  };

  const updateOrderStatus = async () => {
    if (status !== "success" || !preferenceId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      console.log(`Buscando pedido com preference_id: ${preferenceId}`);
      
      // First try to find any order with this preference ID (paid or unpaid)
      const { data: orders, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .ilike("payment_link", `%${preferenceId}%`);

      if (fetchError) {
        console.error("Error fetching order:", fetchError);
        toast({
          title: "Erro",
          description: "Erro ao buscar informações do pedido.",
          variant: "destructive",
        });
        return;
      }

      if (orders && orders.length > 0) {
        const order = orders[0];
        console.log(`Pedido encontrado: #${order.id}, is_paid: ${order.is_paid}`);
        
        if (order.is_paid) {
          // Order already paid (probably by webhook)
          toast({
            title: "Pagamento já confirmado",
            description: `Pedido #${order.id} já foi marcado como pago.`,
          });
          return;
        }
        
        // Update order status to paid
        const { error: updateError } = await supabase
          .from("orders")
          .update({ is_paid: true })
          .eq("id", order.id);

        if (updateError) {
          console.error("Error updating order:", updateError);
          toast({
            title: "Erro",
            description: "Não foi possível atualizar o status do pedido.",
            variant: "destructive",
          });
        } else {
          console.log(`Pedido #${order.id} marcado como pago via return page`);
          toast({
            title: "Pagamento confirmado",
            description: `Pedido #${order.id} marcado como pago. Enviando confirmação por WhatsApp...`,
          });

          // Enviar template PAID_ORDER via edge function (envio automático)
          try {
            const payload = {
              tenant_id: order.tenant_id,
              order_id: order.id,
              customer_phone: order.customer_phone,
              total: Number(order.total_amount || 0)
            };

            const res = await supabase.functions.invoke('zapi-send-paid-order', { body: payload });
            if (res.error) {
              console.error('Erro na edge function zapi-send-paid-order (automatic):', res.error);
              toast({
                title: 'Aviso',
                description: 'Pedido marcado como pago, mas não foi possível enviar confirmação por WhatsApp.',
                variant: 'destructive'
              });
            } else {
              toast({
                title: 'Confirmação enviada',
                description: `Confirmação de pagamento enviada por WhatsApp para o pedido #${order.id}`,
              });
            }
          } catch (err) {
            console.error('Erro ao chamar zapi-send-paid-order:', err);
            toast({
              title: 'Aviso',
              description: 'Pedido marcado como pago, mas ocorreu um erro ao enviar confirmação por WhatsApp.',
              variant: 'destructive'
            });
          }

          // Sync with Bling ERP (in background)
          try {
            const { data: blingIntegration } = await supabase
              .from('integration_bling')
              .select('is_active, sync_orders, access_token')
              .eq('tenant_id', order.tenant_id)
              .maybeSingle();

            if (blingIntegration?.is_active && blingIntegration?.sync_orders && blingIntegration?.access_token) {
              console.log('📦 Sincronizando pedido com Bling ERP...');
              const blingRes = await supabase.functions.invoke('bling-sync-orders', { 
                body: {
                  action: 'send_order',
                  order_id: order.id,
                  tenant_id: order.tenant_id
                }
              });

              if (blingRes.error) {
                console.error('❌ Erro ao sincronizar com Bling:', blingRes.error);
              } else if (blingRes.data?.success) {
                console.log('✅ Pedido sincronizado com Bling ERP:', blingRes.data);
              }
            }
          } catch (blingErr) {
            console.error('Erro ao sincronizar com Bling:', blingErr);
          }
        }
      } else {
        console.log(`Nenhum pedido encontrado para preference_id: ${preferenceId}`);
        toast({
          title: "Pedido não encontrado",
          description: "Não foi possível localizar o pedido correspondente.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error updating payment status:", error);
      toast({
        title: "Erro",
        description: error?.message || "Erro inesperado ao processar o pagamento.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    const title = `${info.title} | Mercado Pago`;
    const desc = "Status do pagamento Mercado Pago: aprovado, pendente ou não aprovado.";
    document.title = title;

    // Meta description
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);

    // Canonical
    const canonicalHref = `${window.location.origin}/mp/return`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonicalHref);

    // Update order status if payment was successful
    updateOrderStatus();
  }, [info.title, status, preferenceId]);

  return (
    <div className="container mx-auto max-w-2xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Pagamento Mercado Pago</h1>
      </header>

      <main>
        <section className={`rounded border p-6 ${
          info.tone === "success" ? "border-green-500/40 bg-green-500/5" :
          info.tone === "error" ? "border-red-500/40 bg-red-500/5" :
          "border-amber-500/40 bg-amber-500/5"
        }`}>
          <h2 className="text-xl font-semibold mb-2">{info.title}</h2>
          <p className="text-muted-foreground mb-6">{info.desc}</p>
          <div className="flex gap-3">
            <Link to="/checkout" className="underline">Voltar ao Checkout</Link>
            <a href="https://www.mercadopago.com.br" target="_blank" rel="noreferrer" className="underline">
              Mercado Pago
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};

export default MpReturn;

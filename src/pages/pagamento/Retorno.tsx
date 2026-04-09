import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock, XCircle, ShoppingBag } from "lucide-react";

const Retorno = () => {
  const [params] = useSearchParams();
  const status = (params.get("status") || "").toLowerCase();
  const preferenceId = params.get("preference_id");
  const tenantSlug = params.get("tenant");
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const statusConfig: Record<string, { title: string; desc: string; icon: typeof CheckCircle; color: string; bg: string }> = {
    success: {
      title: "Pagamento aprovado! ✅",
      desc: "Seu pagamento foi confirmado com sucesso. Estamos preparando seu pedido.",
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50 border-green-200",
    },
    failure: {
      title: "Pagamento não aprovado",
      desc: "Não conseguimos aprovar o pagamento. Tente novamente ou use outro método de pagamento.",
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
    },
    pending: {
      title: "Pagamento em análise ⏳",
      desc: "Recebemos seu pedido e o pagamento está sendo processado. Você será notificado assim que for confirmado.",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-200",
    },
  };

  const config = statusConfig[status] || {
    title: "Retorno de pagamento",
    desc: "Recebemos o retorno do gateway de pagamento.",
    icon: Clock,
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-200",
  };

  const Icon = config.icon;

  const updateOrderStatus = async () => {
    if (status !== "success" || !preferenceId || isUpdating) return;

    setIsUpdating(true);
    try {
      const { data: orders, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .ilike("payment_link", `%${preferenceId}%`);

      if (fetchError) {
        console.error("Error fetching order:", fetchError);
        return;
      }

      if (orders && orders.length > 0) {
        const order = orders[0];
        if (order.is_paid) return;

        const { error: updateError } = await supabase
          .from("orders")
          .update({ is_paid: true })
          .eq("id", order.id);

        if (!updateError) {
          toast({ title: "Pagamento confirmado", description: `Pedido #${order.id} marcado como pago.` });

          // Send WhatsApp confirmation
          try {
            await supabase.functions.invoke("zapi-send-paid-order", {
              body: { tenant_id: order.tenant_id, order_id: order.id, customer_phone: order.customer_phone, total: Number(order.total_amount || 0) },
            });
          } catch (err) {
            console.error("Erro ao enviar confirmação WhatsApp:", err);
          }

          // Bling sync
          try {
            const { data: blingIntegration } = await supabase
              .from("integration_bling")
              .select("is_active, sync_orders, access_token")
              .eq("tenant_id", order.tenant_id)
              .maybeSingle();

            if (blingIntegration?.is_active && blingIntegration?.sync_orders && blingIntegration?.access_token) {
              await supabase.functions.invoke("bling-sync-orders", {
                body: { action: "send_order", order_id: order.id, tenant_id: order.tenant_id },
              });
            }
          } catch (err) {
            console.error("Erro ao sincronizar com Bling:", err);
          }
        }
      }
    } catch (error) {
      console.error("Error updating payment status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    document.title = `${config.title} | Pagamento`;
    updateOrderStatus();
  }, [status, preferenceId]);

  const catalogLink = tenantSlug ? `/t/${tenantSlug}` : "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className={`rounded-xl border-2 p-8 text-center ${config.bg}`}>
          <Icon className={`mx-auto h-16 w-16 mb-4 ${config.color}`} />
          <h1 className="text-2xl font-bold mb-2">{config.title}</h1>
          <p className="text-muted-foreground mb-6">{config.desc}</p>

          <div className="flex flex-col gap-3">
            <Link
              to={catalogLink}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-3 font-medium hover:opacity-90 transition"
            >
              <ShoppingBag className="h-5 w-5" />
              Voltar ao catálogo
            </Link>

            {status === "failure" && (
              <Link
                to="/checkout"
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 font-medium hover:bg-accent transition"
              >
                Tentar novamente
              </Link>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Em caso de dúvidas, entre em contato com a loja.
        </p>
      </div>
    </div>
  );
};

export default Retorno;

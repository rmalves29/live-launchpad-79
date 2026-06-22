import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  planId: "basic" | "pro" | "enterprise";
  planName: string;
  planPrice: number;
  intervalMonths: number;
  planDays?: number;
  mode?: "subscription" | "one_time";
  userEmail: string;
  onSuccess?: () => void;
}

const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function PagarmeSubscribeDialog({
  open,
  onOpenChange,
  tenantId,
  planId,
  planName,
  planPrice,
  intervalMonths,
  planDays = 30,
  mode = "subscription",
  userEmail,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [holderName, setHolderName] = useState("");
  const [holderDocument, setHolderDocument] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [zip, setZip] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  async function handleSubmit() {
    if (!holderName || !holderDocument || !cardNumber || !cardExpMonth || !cardExpYear || !cardCvv) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    if (!zip || !line1 || !city || !state) {
      toast({ title: "Endereço obrigatório", description: "Preencha o endereço de cobrança", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const fnName = mode === "one_time" ? "pagarme-create-order" : "pagarme-create-subscription";
      const payload: any = {
        tenant_id: tenantId,
        plan_id: planId,
        plan_price: planPrice,
        card: {
          number: onlyDigits(cardNumber),
          holder_name: holderName,
          exp_month: parseInt(cardExpMonth, 10),
          exp_year: parseInt(cardExpYear, 10),
          cvv: onlyDigits(cardCvv),
        },
        holder_name: holderName,
        holder_document: onlyDigits(holderDocument),
        holder_email: userEmail,
        holder_phone: onlyDigits(holderPhone),
        billing_address: {
          line_1: line1,
          line_2: line2,
          zip_code: onlyDigits(zip),
          city,
          state: state.toUpperCase(),
          country: "BR",
        },
      };
      if (mode === "one_time") {
        payload.plan_name = planName;
        payload.plan_days = planDays;
      }
      const { data, error } = await supabase.functions.invoke(fnName, { body: payload });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao processar pagamento");

      toast({
        title: mode === "one_time" ? "Pagamento aprovado!" : "Assinatura criada!",
        description:
          mode === "one_time"
            ? `Plano ${planName} ativado por ${planDays} dias.`
            : `Seu plano ${planName} foi ativado com renovação automática.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao processar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "one_time" ? `Pagar ${planName}` : `Assinar ${planName} - Renovação automática`}
          </DialogTitle>
          <DialogDescription>
            {mode === "one_time"
              ? `Pagamento único no cartão. Acesso por ${planDays} dias.`
              : `Cobrança recorrente no cartão a cada ${intervalMonths} meses. Você pode cancelar a qualquer momento.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" /> Pagamento processado por Pagar.me
            </div>
            <div className="text-muted-foreground mt-1">
              Valor: <strong>R$ {planPrice.toFixed(2).replace(".", ",")}</strong>
              {mode === "one_time" ? " (pagamento único)" : ` a cada ${intervalMonths} meses`}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Titular do cartão</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>Nome no cartão</Label>
                <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Como aparece no cartão" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={holderDocument} onChange={(e) => setHolderDocument(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={holderPhone} onChange={(e) => setHolderPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Dados do cartão</h4>
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-6">
                <Label>Número</Label>
                <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="0000 0000 0000 0000" />
              </div>
              <div className="col-span-2">
                <Label>Mês</Label>
                <Input value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value)} placeholder="MM" maxLength={2} />
              </div>
              <div className="col-span-2">
                <Label>Ano</Label>
                <Input value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value)} placeholder="AAAA" maxLength={4} />
              </div>
              <div className="col-span-2">
                <Label>CVV</Label>
                <Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="123" maxLength={4} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Endereço de cobrança</h4>
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-2">
                <Label>CEP</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="00000-000" />
              </div>
              <div className="col-span-4">
                <Label>Endereço</Label>
                <Input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Rua, número" />
              </div>
              <div className="col-span-6">
                <Label>Complemento</Label>
                <Input value={line2} onChange={(e) => setLine2(e.target.value)} />
              </div>
              <div className="col-span-4">
                <Label>Cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>UF</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} placeholder="SP" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {mode === "one_time" ? "Pagar agora" : "Confirmar assinatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

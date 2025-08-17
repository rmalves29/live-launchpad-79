import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";

const MpReturn = () => {
  const [params] = useSearchParams();
  const status = (params.get("status") || "").toLowerCase();

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
  }, [info.title]);

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

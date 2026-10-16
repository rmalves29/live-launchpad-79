import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import cartzyLogo from "@/assets/cartzy-logo.png";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";

interface Props {
  current: "privacy" | "terms";
  children: ReactNode;
}

/** Moldura das páginas legais: mesmo visual escuro da landing do Cartzy (sem marca antiga). */
export default function LegalLayout({ current, children }: Props) {
  const tab = (active: boolean) =>
    `text-sm font-medium transition-colors border-b-2 pb-1 ${active ? "text-white border-indigo-400" : "text-slate-400 border-transparent hover:text-white"}`;
  return (
    <div className="min-h-screen bg-[#07080F] text-slate-300 flex flex-col">
      <header className="border-b border-white/10 bg-[#07080F]/80 backdrop-blur-xl">
        <div className="container mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" aria-label="Cartzy">
            <img src={cartzyLogo} alt="Cartzy" className="h-7 w-auto object-contain brightness-0 invert" />
          </Link>
          <Link to="/auth" className="text-sm text-slate-400 hover:text-white transition-colors">
            Entrar
          </Link>
        </div>
      </header>

      <nav className="border-b border-white/5 bg-slate-950 flex justify-center gap-8 pt-4 pb-3">
        <Link to="/politica-de-privacidade" className={tab(current === "privacy")}>
          Política de Privacidade
        </Link>
        <Link to="/termos-de-uso" className={tab(current === "terms")}>
          Termos de Uso
        </Link>
      </nav>

      <main className="flex-1 px-3 sm:px-5">
        <div
          className="max-w-[860px] mx-auto my-8 sm:my-12 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-7 sm:px-14 sm:py-12 shadow-2xl shadow-black/30
            [&_h1]:text-white [&_h2]:text-white [&_h2]:border-white/10 [&_strong]:text-white [&_p]:text-slate-300 [&_li]:text-slate-300
            [&_a]:text-indigo-400 [&_a:hover]:text-indigo-300 [&_.text-muted-foreground]:text-slate-500"
        >
          {children}
        </div>
      </main>

      <footer className="py-10 border-t border-white/5 bg-slate-950">
        <div className="container mx-auto px-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <img src={cartzyLogo} alt="Cartzy" className="h-7 w-auto object-contain brightness-0 invert" />
            <div className="flex items-center gap-6">
              <Link to="/politica-de-privacidade" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Política de Privacidade
              </Link>
              <Link to="/termos-de-uso" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Termos de Uso
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Contato
              </a>
            </div>
            <p className="text-xs text-slate-600">© 2026 Cartzy. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import cartzyLogo from "@/assets/cartzy-logo.png";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";
const SITE_URL = "https://cartzy.com.br";

interface Props {
  current: "privacy" | "terms";
  children: ReactNode;
}

/** Moldura das páginas legais: mesmo visual claro do site cartzy.com.br (cabeçalho, rodapé e cores). */
export default function LegalLayout({ current, children }: Props) {
  const tab = (active: boolean) =>
    `text-sm font-semibold transition-colors border-b-2 pb-1 no-underline ${
      active ? "text-[#4338ca] border-[#4f46e5]" : "text-[#64748b] border-transparent hover:text-[#0f172a]"
    }`;
  return (
    <div className="min-h-screen bg-white text-[#334155] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[#e5e7eb] bg-white/80 backdrop-blur-md">
        <nav className="mx-auto max-w-[1180px] px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href={SITE_URL} aria-label="Cartzy, página inicial">
            <img src={cartzyLogo} alt="Cartzy" className="block h-[30px] w-auto" />
          </a>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2 text-sm font-semibold text-[#0f172a] no-underline shadow-sm transition hover:border-[#4f46e5] hover:bg-indigo-50"
          >
            Já sou cliente →
          </Link>
        </nav>
      </header>

      <nav className="flex justify-center gap-8 border-b border-[#e5e7eb] bg-[#f8f9fb] pt-4 pb-3">
        <Link to="/politica-de-privacidade" className={tab(current === "privacy")}>
          Política de Privacidade
        </Link>
        <Link to="/termos-de-uso" className={tab(current === "terms")}>
          Termos de Uso
        </Link>
      </nav>

      <main className="flex-1 bg-[#f8f9fb] px-3 sm:px-6 pb-12">
        <div
          className="mx-auto my-8 sm:my-12 max-w-[820px] rounded-2xl border border-[#e5e7eb] bg-white px-5 py-7 sm:px-12 sm:py-12
            shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)]
            [&_h1]:text-[#0f172a] [&_h1]:tracking-tight [&_h2]:text-[#0f172a] [&_h2]:border-[#e5e7eb] [&_h2]:tracking-tight
            [&_strong]:text-[#0f172a] [&_p]:text-[#334155] [&_li]:text-[#334155]
            [&_a]:text-[#4338ca] [&_a]:font-semibold [&_a]:underline [&_a]:decoration-[#4338ca]/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-[#4338ca]
            [&_.text-muted-foreground]:text-[#64748b]"
        >
          {children}
        </div>
      </main>

      <footer className="border-t border-[#e5e7eb] bg-white py-10 text-sm text-[#64748b]">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-5">
          <img src={cartzyLogo} alt="Cartzy" className="h-7 w-auto" />
          <div className="flex items-center gap-6">
            <Link to="/politica-de-privacidade" className="hover:text-[#0f172a]">Política de Privacidade</Link>
            <Link to="/termos-de-uso" className="hover:text-[#0f172a]">Termos de Uso</Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[#0f172a]">Contato</a>
          </div>
          <p className="text-[13px]">© {new Date().getFullYear()} Cartzy</p>
        </div>
      </footer>
    </div>
  );
}

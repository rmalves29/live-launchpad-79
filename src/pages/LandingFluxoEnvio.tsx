import {
  Send,
  Users,
  Shield,
  Zap,
  BarChart3,
  Clock,
  MessageSquare,
  Repeat,
  AlertCircle,
  Moon,
  Heart,
  Bot,
  Check,
  X,
  ChevronDown,
  Menu,
  ArrowRight,
  Star,
  Calendar,
  UserX,
  Sparkles,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import cartzyLogo from "@/assets/cartzy-logo.png";
import FuturisticFX from "@/components/landing/FuturisticFX";
import FluxoSignupDialog from "@/components/landing/FluxoSignupDialog";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";

// ─── Efeitos visuais reutilizados da landing Cartzy ───
const FX_CSS = `
@keyframes lpFloat { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(40px,-30px) scale(1.08); } 66% { transform: translate(-30px,20px) scale(0.95); } }
@keyframes lpFloatAlt { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,40px) scale(1.12); } }
@keyframes lpShimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes lpPulseDot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.75); } }
@keyframes lpGlowPulse { 0%,100% { box-shadow: 0 0 30px 0 rgba(14,165,233,.45); } 50% { box-shadow: 0 0 55px 8px rgba(34,211,238,.7); } }
@keyframes lpBorderSpin { to { transform: rotate(360deg); } }
@keyframes lpMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes lpHeroFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

.lp-shimmer-text { background-size: 200% auto; animation: lpShimmer 5s ease-in-out infinite; }
.lp-pulse-dot { animation: lpPulseDot 1.6s ease-in-out infinite; }
.lp-glow-cta { animation: lpGlowPulse 2.8s ease-in-out infinite; }
.lp-hero-float { animation: lpHeroFloat 7s ease-in-out infinite; }
.lp-marquee { animation: lpMarquee 32s linear infinite; }
.lp-marquee:hover { animation-play-state: paused; }

.lp-frame { position: relative; }
.lp-frame::before {
  content: ""; position: absolute; inset: -2px; border-radius: 1.05rem; z-index: 0;
  background: conic-gradient(from 0deg, transparent 0%, rgba(14,165,233,.9) 12%, rgba(34,211,238,.9) 22%, transparent 34%);
  animation: lpBorderSpin 6s linear infinite;
}
.lp-frame > * { position: relative; z-index: 1; }

.lp-reveal { opacity: 0; transform: translateY(28px); transition: opacity .7s ease, transform .7s cubic-bezier(.22,1,.36,1); will-change: opacity, transform; }
.lp-reveal.lp-in { opacity: 1; transform: translateY(0); }

.lp-card-glow { transition: box-shadow .3s ease, transform .3s ease, border-color .3s ease; }
.lp-card-glow:hover { box-shadow: 0 0 35px -5px rgba(34,211,238,.35); transform: translateY(-3px); border-color: rgba(34,211,238,.4); }

@media (prefers-reduced-motion: reduce) {
  .lp-shimmer-text, .lp-pulse-dot, .lp-glow-cta, .lp-hero-float, .lp-marquee, .lp-frame::before { animation: none !important; }
  .lp-reveal { opacity: 1; transform: none; transition: none; }
}
`;

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-in");
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

function CountUp({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const numeric = parseInt(value, 10);
    if (Number.isNaN(numeric)) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const dur = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(String(Math.round(numeric * eased)) + value.replace(String(numeric), ""));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);
  return <span ref={ref}>{display}{suffix}</span>;
}

export default function LandingFluxoEnvio() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  useEffect(() => {
    document.title = "Fluxo de Envio — Escale seus grupos de WhatsApp sem tomar bloqueio";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Dispare campanhas em todos os seus grupos de WhatsApp com ritmo humano, proteção anti-bloqueio e relatórios em tempo real. Sem custo por mensagem, sem API oficial.");
  }, []);

  const pains = [
    { icon: Clock, title: "3 horas da noite copiando e colando em 30 grupos", description: "Você abre grupo por grupo, cola a mesma mensagem, espera carregar, roda o cursor. Enquanto isso, seu concorrente já disparou em 200 grupos e foi dormir." },
    { icon: UserX, title: "As pessoas saem do grupo e você nem fica sabendo", description: "Todo dia sua audiência encolhe silenciosamente. Você só percebe no dia da oferta — quando abre a live e vê metade da galera que sumiu." },
    { icon: AlertCircle, title: "Membros bloqueados voltam entrando de novo", description: "Você bloqueou aquela pessoa problemática, e ela cria outra conta e volta pro mesmo grupo. Vira uma peneira furada consumindo seu tempo de moderação." },
    { icon: Moon, title: "Você virou refém da rotina de disparo", description: "Toda campanha nova é uma noite mal dormida. Você quer escalar o negócio, mas o gargalo é você — teclando manualmente enquanto o mercado corre." },
  ];

  const failedFixes = [
    { title: "WhatsApp Web aberto o dia todo", quote: "“Eu ficava com 4 abas abertas, colava mensagem em cada grupo... o computador travava, eu perdia a conta de onde parei. Depois de 3 horas, resultado zero.”" },
    { title: "CRM genérico caro e cheio de botão", quote: "“Paguei fortunas em CRM gringo. Levei 2 semanas configurando, ninguém do suporte falava português, e no final não funcionava com grupo — só com contato individual.”" },
    { title: "Contratar estagiário pra copiar/colar", quote: "“Gastei R$ 1.500/mês pra ter alguém fazendo disparo manual. A pessoa erroneamente enviou promoção velha, cliente reclamou, eu perdi credibilidade e o dinheiro.”" },
    { title: "Ferramenta gringa sem suporte BR", quote: "“Comprei uma tool americana. Configurei metade em inglês, o webhook não funcionou, e quando pedi ajuda me responderam em 4 dias — depois que meu lançamento já tinha acabado.”" },
    { title: "Bot pirata que queimou 3 chips", quote: "“Achei que tinha economizado usando um script comprado num grupo do Telegram. Em uma semana perdi 3 números de WhatsApp. Fazer as contas doeu.”" },
    { title: "Planilha de controle manual", quote: "“Tinha uma planilha gigante com todos os grupos, marcava com X onde já tinha enviado. No meio do caos eu me perdia e enviava a mesma promoção 2x no mesmo grupo.”" },
  ];

  const features = [
    { icon: Send, title: "Disparo em massa com ritmo humano", description: "Envia para 200+ grupos em sequência, com intervalos randômicos e mensagens variadas — o WhatsApp lê como comportamento humano, não como bot." },
    { icon: Calendar, title: "Agendamento inteligente", description: "Programe campanhas para o horário exato do seu lançamento. Áudio, foto, vídeo, texto e enquetes — tudo agendado com um clique." },
    { icon: Repeat, title: "Fluxo de Retorno automático", description: "Cliente saiu do grupo? O sistema envia mensagem privada convidando ela de volta e libera um cupom só quando ela realmente retornar. Recupera audiência no automático." },
    { icon: UserX, title: "Bloqueio inteligente de clientes", description: "Cliente bloqueado não entra mais em nenhum grupo seu, mesmo criando conta nova — o sistema barra na porta antes de você perder tempo moderando." },
    { icon: Users, title: "Distribuição ponderada entre grupos", description: "Defina em % quantos novos membros cada grupo recebe. Distribui audiência automaticamente sem estourar limite do WhatsApp." },
    { icon: Link2, title: "Redirect em <1 segundo", description: "Link do tipo /fluxo/loja/campanha entra direto no grupo, sem página intermediária. Ganha 3-5s por clique — decisivo em tráfego pago." },
    { icon: BarChart3, title: "Relatórios em tempo real", description: "Entradas, saídas, cliques por campanha, retenção por grupo e taxa de retorno — tudo atualizando sozinho no dashboard." },
    { icon: ShieldCheck, title: "Proteção anti-bloqueio", description: "Ritmo humano, mensagens com variação, controle de consentimento e injeção de caracteres invisíveis. Seu chip protegido a cada disparo." },
    { icon: Bot, title: "Suporte humano no WhatsApp", description: "Quando algo der ruim no meio do lançamento, você fala com gente de verdade — nada de ticket que responde daqui a 4 dias." },
  ];


  const steps = [
    { step: "01", title: "Conecte seu WhatsApp", description: "Escaneia o QR Code igual você faz no WhatsApp Web. Em 30 segundos está pareado — sem depender de aprovação da Meta." },
    { step: "02", title: "Importe todos os seus grupos", description: "O sistema puxa a lista completa de grupos onde você é admin. Um clique e todos aparecem no painel, prontos pra usar." },
    { step: "03", title: "Monte a campanha com mídia", description: "Texto, foto, vídeo, áudio, PDF, enquete. Escreva uma vez, escolha os grupos, e o sistema cuida do resto." },
    { step: "04", title: "Agende com ritmo humano", description: "Escolha data e hora do disparo. O sistema distribui o envio com intervalos naturais — o WhatsApp não desconfia." },
    { step: "05", title: "Acompanhe em tempo real", description: "Vê quem entrou, quem saiu, quantos cliques, taxa de retorno. Ajusta a próxima campanha com dado, não com achismo." },
  ];

  const comparison = [
    { without: "Copiar e colar em 200 grupos, um por um", with: "Um clique dispara em todos, com ritmo humano" },
    { without: "Chip banido no meio do lançamento", with: "Proteção anti-bloqueio com envio inteligente" },
    { without: "Não sabe qual grupo dá retorno", with: "Relatório de conversão por grupo em tempo real" },
    { without: "Audiência derretendo silenciosamente", with: "Fluxo de Retorno traz saídos de volta no automático" },
    { without: "Página intermediária de 5s no link do grupo", with: "Redirect em <1s, entrada direto no grupo" },
    { without: "Suporte gringo respondendo em 4 dias", with: "Suporte humano no WhatsApp, em português" },
  ];

  const transformations = [
    { icon: Heart, before: "“Eu era escravo do lançamento. Passava a noite disparando manualmente pra não perder janela de tráfego.”", after: "“Hoje eu configuro a campanha, agendo e vou dormir. Acordo com o relatório pronto e os grupos cheios.”" },
    { icon: Shield, before: "“Perdi 3 números de WhatsApp em 6 meses. Toda vez que crescia, o chip caía.”", after: "“Faz 1 ano com o mesmo número. Disparo pra 400 grupos por semana e não tomo bloqueio.”" },
    { icon: Zap, before: "“Meu concorrente lançava 3 vezes enquanto eu terminava 1. Não conseguia escalar sozinho.”", after: "“Hoje eu faço 4 lançamentos por mês, sem contratar ninguém. O sistema é meu operador invisível.”" },
  ];

  const testimonials = [
    { name: "Rafael Torres", role: "Infoprodutor — Curso de Marketing", stars: 5, text: "Antes eu passava madrugada no WhatsApp Web disparando pra 80 grupos. Agora agendo e vou viver a vida. No último lançamento faturei 3x mais gastando metade do tempo." },
    { name: "Débora Assis", role: "Revenda em Live — Moda Feminina", stars: 5, text: "O Fluxo de Retorno mudou meu jogo. As pessoas saem do grupo, o sistema chama de volta com cupom e elas voltam. Recuperei 22% da audiência que tava vazando." },
    { name: "Marcos Oliveira", role: "E-commerce — Suplementos", stars: 5, text: "Testei 3 ferramentas antes. Todas queimaram chip. O Fluxo de Envio dispara 400 grupos por semana e meu número tá firme há 8 meses. É outra realidade." },
  ];

  const faqs = [
    { question: "Vou tomar bloqueio no meu WhatsApp?", answer: "A proteção anti-bloqueio é o coração do sistema: ritmo humano com intervalos randômicos entre disparos, variação automática de mensagens, injeção de caracteres invisíveis e controle de consentimento das clientes. Nossos usuários mais ativos disparam para 400+ grupos por semana com o mesmo número há mais de 1 ano. Zero bloqueio quando você segue as boas práticas que ensinamos na configuração." },
    { question: "Preciso da API oficial do WhatsApp (Meta)?", answer: "Não. O Fluxo de Envio conecta direto no seu WhatsApp comum via QR Code, igual ao WhatsApp Web. Sem custo por mensagem, sem taxa de template, sem depender da aprovação lenta da Meta. Você paga a mensalidade do sistema e envia quantas mensagens quiser." },
    { question: "Funciona para quantos grupos?", answer: "Sem limite técnico. Temos clientes rodando com 500+ grupos ativos simultaneamente. O que importa é respeitar o ritmo de envio — e isso o sistema controla sozinho." },
    { question: "E se eu tiver problema no meio de um lançamento?", answer: "O suporte é humano, em português, direto no WhatsApp. Nada de ticket em inglês que responde daqui a uma semana. Nos lançamentos maiores dos nossos clientes, ficamos de plantão junto." },
    { question: "Preciso instalar alguma coisa no computador?", answer: "Nada. O sistema roda 100% na nuvem, você acessa do navegador. Seu computador pode desligar que os disparos agendados continuam rodando normalmente." },
    { question: "Tem contrato de fidelidade?", answer: "No plano mensal, não — você cancela quando quiser sem multa. Planos anuais têm condições especiais; fale com a equipe no WhatsApp para conhecer as opções." },
    { question: "Consigo migrar da ferramenta que uso hoje?", answer: "Sim. A equipe faz a importação dos seus grupos, contatos e campanhas ativas junto com você na implantação. Em 1 dia você já está rodando no novo sistema, sem perder histórico." },
    { question: "Tem período de teste?", answer: "Sim. Fale com a equipe no WhatsApp para ativar seu acesso de avaliação e ver o sistema rodando com seus próprios grupos antes de decidir." },
  ];

  const benefits = [
    { value: "400", label: "Grupos por semana", description: "com um único número sem bloqueio", suffix: "+" },
    { value: "3", label: "Horas economizadas", description: "por lançamento vs. disparo manual", suffix: "h" },
    { value: "22", label: "Da audiência recuperada", description: "com Fluxo de Retorno automático", suffix: "%" },
    { value: "24/7", label: "Disparo agendado", description: "roda mesmo com você offline" },
  ];

  return (
    <div className="min-h-screen bg-[#020c1b] text-white overflow-x-hidden font-sans">
      <style dangerouslySetInnerHTML={{ __html: FX_CSS }} />

      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#020c1b]/80 backdrop-blur-xl">
        <div className="container mx-auto px-5 h-16 flex items-center justify-between">
          <img src={cartzyLogo} alt="Cartzy" className="h-7 w-auto object-contain brightness-0 invert" />

          <div className="hidden md:flex items-center gap-8">
            {[["#dores", "Isso é você?"], ["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-slate-400 hover:text-sky-300 transition-colors">{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden md:block">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-white/10">Entrar</Button>
            </Link>
            <Button onClick={() => setSignupOpen(true)} size="sm" className="bg-sky-500 hover:bg-sky-400 text-white font-medium shadow-lg shadow-sky-500/30">
              Quero testar
            </Button>
            <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#020c1b] px-5 py-4 flex flex-col gap-4">
            {[["#dores", "Isso é você?"], ["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-sm text-slate-300 hover:text-sky-300">{label}</a>
            ))}
            <Link to="/auth" className="text-sm text-slate-300 hover:text-sky-300">Entrar</Link>
          </div>
        )}
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden">
        <FuturisticFX variant="hero" />
        <div className="container mx-auto px-5 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full lp-pulse-dot" />
                Sistema Fluxo de Envio — powered by Cartzy
              </div>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
                Escale seus grupos de <br className="hidden md:block" />
                WhatsApp{" "}
                <span className="lp-shimmer-text bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
                  sem tomar bloqueio
                </span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                Dispare campanhas para <strong className="text-white">200+ grupos ao mesmo tempo</strong>, com ritmo humano, proteção anti-ban e relatórios em tempo real. Sem custo por mensagem, sem API oficial da Meta.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button onClick={() => setSignupOpen(true)} size="lg" className="lp-glow-cta bg-sky-500 hover:bg-sky-400 text-white font-semibold text-base px-8 h-14 shadow-xl shadow-sky-500/40">
                  Quero testar o Fluxo de Envio
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <a href="#how-it-works">
                  <Button size="lg" variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10 font-medium text-base px-6 h-14">
                    Ver como funciona
                  </Button>
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Sem custo por mensagem</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Suporte em português</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Configuração assistida</span>
              </div>
            </Reveal>
          </div>

          {/* Barra de números */}
          <Reveal delay={400} className="mt-20">
            <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 p-6 md:p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
              {benefits.map((b) => (
                <div key={b.label} className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-sky-300 to-cyan-400 mb-1">
                    <CountUp value={b.value} suffix={b.suffix || ""} />
                  </div>
                  <div className="text-sm font-medium text-white">{b.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{b.description}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── MARQUEE DE INTEGRAÇÕES ─── */}
      <section className="py-10 border-y border-white/5 bg-white/[0.015]">
        <div className="container mx-auto px-5">
          <p className="text-center text-xs uppercase tracking-widest text-slate-500 mb-6">Integra com as ferramentas que você já usa</p>
          <div className="overflow-hidden">
            <div className="lp-marquee flex gap-12 w-max">
              {[...integrations, ...integrations].map((name, i) => (
                <span key={i} className="text-slate-400 text-sm font-medium whitespace-nowrap flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-sky-400/60 rounded-full" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── DORES ─── */}
      <section id="dores" className="py-24 md:py-32 relative">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/20 bg-red-500/10 text-red-300 text-xs font-medium mb-4">
              <AlertCircle className="w-3 h-3" /> Isso é você?
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Se você vende em grupo de WhatsApp,<br />
              <span className="text-slate-400">provavelmente já viveu isso:</span>
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pains.map((p, i) => (
              <Reveal key={p.title} delay={i * 60}>
                <div className="lp-card-glow h-full p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <p.icon className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{p.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{p.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── GAMBIARRAS ─── */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Você já tentou de tudo…</h2>
            <p className="text-lg text-slate-400">E cada tentativa custou tempo, dinheiro ou um chip queimado.</p>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {failedFixes.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="lp-card-glow h-full p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center gap-2 mb-3">
                    <X className="w-4 h-4 text-red-400" />
                    <h3 className="text-base font-semibold text-white">{f.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400 italic leading-relaxed">{f.quote}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="how-it-works" className="py-24 md:py-32 relative">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-300 text-xs font-medium mb-4">
              <Sparkles className="w-3 h-3" /> Como funciona
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Do zero ao primeiro disparo <span className="text-sky-400">em 10 minutos</span></h2>
          </Reveal>
          <div className="max-w-4xl mx-auto space-y-4">
            {steps.map((s, i) => (
              <Reveal key={s.step} delay={i * 80}>
                <div className="lp-card-glow flex gap-6 p-6 md:p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-sky-500/30">
                    {s.step}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">{s.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{s.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24 md:py-32 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 text-xs font-medium mb-4">
              <Zap className="w-3 h-3" /> O que está incluso
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Tudo que você precisa para escalar seus grupos</h2>
            <p className="text-lg text-slate-400">Um sistema completo, feito por quem vive de WhatsApp — não copiado de ferramenta gringa.</p>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 50}>
                <div className="lp-card-glow h-full p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500/20 to-cyan-500/20 border border-sky-500/30 flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5 text-sky-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ANTES × DEPOIS ─── */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Antes do Fluxo de Envio <span className="text-slate-500">×</span> <span className="text-sky-400">Depois</span>
            </h2>
          </Reveal>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-center text-red-400 font-semibold text-sm uppercase tracking-widest mb-2">Sem sistema</div>
              {comparison.map((c) => (
                <div key={c.without} className="flex items-start gap-3 p-4 rounded-xl border border-red-500/15 bg-red-500/[0.04]">
                  <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-300">{c.without}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="text-center text-emerald-400 font-semibold text-sm uppercase tracking-widest mb-2">Com Fluxo de Envio</div>
              {comparison.map((c) => (
                <div key={c.with} className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">{c.with}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRANSFORMAÇÃO ─── */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-transparent via-sky-500/[0.03] to-transparent">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">A transformação de quem já usa</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {transformations.map((t, i) => (
              <Reveal key={i} delay={i * 80}>
                <div className="lp-card-glow h-full p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center mb-5 shadow-lg shadow-sky-500/30">
                    <t.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="mb-4 pb-4 border-b border-white/10">
                    <div className="text-xs uppercase tracking-widest text-red-400 mb-1.5">Antes</div>
                    <p className="text-sm text-slate-400 italic leading-relaxed">{t.before}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-emerald-400 mb-1.5">Depois</div>
                    <p className="text-sm text-white leading-relaxed">{t.after}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DEPOIMENTOS ─── */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Quem já disparou milhões de mensagens</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 80}>
                <div className="lp-card-glow h-full p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-slate-300 leading-relaxed mb-6 italic">"{t.text}"</p>
                  <div className="pt-4 border-t border-white/10">
                    <div className="font-semibold text-white text-sm">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-24 md:py-32 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="container mx-auto px-5">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Perguntas frequentes</h2>
          </Reveal>
          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={i} delay={i * 30}>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-medium text-white pr-4">{f.question}</span>
                    <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5 text-sm text-slate-400 leading-relaxed">{f.answer}</div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        <FuturisticFX variant="section" />
        <div className="container mx-auto px-5 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <Reveal>
              <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                Pronto para parar de <span className="text-red-400 line-through">disparar manualmente</span><br />
                e começar a{" "}
                <span className="lp-shimmer-text bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
                  escalar de verdade?
                </span>
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">
                Fale com a equipe agora e veja o Fluxo de Envio rodando com seus próprios grupos.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <Button onClick={() => setSignupOpen(true)} size="lg" className="lp-glow-cta bg-sky-500 hover:bg-sky-400 text-white font-semibold text-base px-10 h-14 shadow-xl shadow-sky-500/40">
                Criar minha conta grátis
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Reveal>
            <Reveal delay={280}>
              <p className="text-xs text-slate-500 mt-6">Sem cartão de crédito • Suporte humano em português • Cancele quando quiser</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/10 py-10 bg-[#020c1b]">
        <div className="container mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <img src={cartzyLogo} alt="Cartzy" className="h-6 w-auto brightness-0 invert opacity-80" />
            <span>© {new Date().getFullYear()} Cartzy — Fluxo de Envio</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/privacy-policy" className="hover:text-sky-300 transition-colors">Privacidade</Link>
            <Link to="/terms-of-use" className="hover:text-sky-300 transition-colors">Termos</Link>
            <Link to="/landing" className="hover:text-sky-300 transition-colors">Cartzy completo</Link>
          </div>
        </div>
      </footer>

      <FluxoSignupDialog open={signupOpen} onOpenChange={setSignupOpen} />
    </div>
  );
}

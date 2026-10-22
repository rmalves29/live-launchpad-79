import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

const SENTRY_DSN = "https://335d719db5d30da02c337fde1fb59194@o4511536610607104.ingest.us.sentry.io/4511536728637440";

// O Sentry (cerca de 1 MB sem compactar) saiu do pacote principal: carrega depois que a página já está na tela.
async function initSentry() {
  const Sentry = await import("@sentry/react");
  Sentry.init({
  dsn: SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: `cartzy-v2@${import.meta.env.VITE_APP_VERSION || "dev"}`,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  replaysSessionSampleRate: import.meta.env.PROD ? 0.05 : 0.0,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    // Ignora erros do StrictMode no desenvolvimento
    if (import.meta.env.DEV && event.exception?.values?.some(v => v.type === "Warning")) {
      return null;
    }
    return event;
  },
  });
}

// Após nova publicação, abas abertas pedem arquivos antigos que não existem mais.
// Recarrega a página uma vez (no máximo a cada 10s) para buscar a versão nova.
function reloadOnStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem("chunk_reload_at") || 0);
    if (Date.now() - last < 10000) return false;
    sessionStorage.setItem("chunk_reload_at", String(Date.now()));
  } catch {}
  window.location.reload();
  return true;
}
window.addEventListener("vite:preloadError", (e) => {
  // Só suprime o erro se de fato for recarregar; senão o import resolve "undefined" e quebra a tela.
  if (reloadOnStaleChunk()) e.preventDefault();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e as PromiseRejectionEvent).reason?.message || "");
  if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
    reloadOnStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("requestIdleCallback" in window) {
  (window as any).requestIdleCallback(() => { initSentry().catch(() => {}); }, { timeout: 4000 });
} else {
  setTimeout(() => { initSentry().catch(() => {}); }, 2000);
}

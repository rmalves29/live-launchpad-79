import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

const SENTRY_DSN = "https://335d719db5d30da02c337fde1fb59194@o4511536610607104.ingest.us.sentry.io/4511536728637440";

Sentry.init({
  dsn: SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: `orderzap-v2@${import.meta.env.VITE_APP_VERSION || "dev"}`,
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

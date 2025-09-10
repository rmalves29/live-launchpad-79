import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantLoader } from "@/components/TenantLoader";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <TenantLoader>
          <App />
        </TenantLoader>
      </TenantProvider>
    </QueryClientProvider>
  </StrictMode>,
);

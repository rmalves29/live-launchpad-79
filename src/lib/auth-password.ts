import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthLikeError = {
  message: string;
  name?: string;
  status?: number;
  statusCode?: number;
};

type ResilientSignInResult = {
  data: {
    user: User | null;
    session: Session | null;
  };
  error: AuthLikeError | null;
};

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://hxtbsieodbtzgcvvkeqx.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4";

const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const AUTH_STORAGE_KEYS = [
  `sb-${SUPABASE_PROJECT_REF}-auth-token`,
  "supabase.auth.token",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Erro desconhecido de autenticação";
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const maybeStatus =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { status?: unknown; statusCode?: unknown }).statusCode;

  return typeof maybeStatus === "number" ? maybeStatus : undefined;
}

function toAuthLikeError(error: unknown, fallbackStatus?: number): AuthLikeError {
  return {
    message: getErrorMessage(error),
    name: error instanceof Error ? error.name : undefined,
    status: getErrorStatus(error) ?? fallbackStatus,
    statusCode: getErrorStatus(error) ?? fallbackStatus,
  };
}

export function isInvalidCredentialsError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    message.includes("invalid login credentials") ||
    message.includes("invalid login") ||
    message.includes("invalid_credentials") ||
    status === 400
  );
}

export function isNetworkAuthError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("load failed") ||
    message.includes("fetch resource") ||
    message.includes("network request failed")
  );
}

function clearLocalAuthArtifacts() {
  AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // noop
    }
  });
}

/**
 * Fallback usando XMLHttpRequest para contornar o proxy de fetch do Preview Lovable.
 * O proxy intercepta window.fetch mas não intercepta XMLHttpRequest.
 */
function xhrPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    
    xhr.onload = () => {
      resolve({ status: xhr.status, body: xhr.responseText });
    };
    
    xhr.onerror = () => {
      reject(new Error("XMLHttpRequest falhou - verifique sua conexão de internet"));
    };
    
    xhr.ontimeout = () => {
      reject(new Error("Timeout na requisição de autenticação"));
    };
    
    xhr.timeout = 15000; // 15 segundos
    xhr.send(body);
  });
}

async function signInWithXHR(email: string, password: string): Promise<ResilientSignInResult> {
  try {
    console.info("[auth] Tentando login via XMLHttpRequest (bypass do proxy)");
    
    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "X-Client-Info": "orderzap-auth-xhr-fallback",
    };
    const body = JSON.stringify({ email, password });
    
    const response = await xhrPost(url, body, headers);
    
    let payload: any = null;
    try {
      payload = JSON.parse(response.body);
    } catch {
      // ignore parse errors
    }

    if (response.status >= 400) {
      const errorMessage =
        payload?.msg ||
        payload?.error_description ||
        payload?.message ||
        payload?.error ||
        `Falha na autenticação (${response.status})`;

      return {
        data: { user: null, session: null },
        error: {
          message: String(errorMessage),
          status: response.status,
          statusCode: response.status,
        },
      };
    }

    if (!payload?.access_token || !payload?.refresh_token) {
      return {
        data: { user: null, session: null },
        error: {
          message: "Resposta de autenticação inválida recebida do Supabase.",
        },
      };
    }

    // Injetar a sessão no cliente Supabase
    const { data, error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });

    return {
      data: {
        user: data.user,
        session: data.session,
      },
      error: error ? toAuthLikeError(error) : null,
    };
  } catch (error) {
    console.error("[auth] XMLHttpRequest fallback falhou:", error);
    return {
      data: { user: null, session: null },
      error: toAuthLikeError(error),
    };
  }
}

async function signInWithDirectFetch(email: string, password: string): Promise<ResilientSignInResult> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "X-Client-Info": "orderzap-auth-fallback",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload: any = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        payload?.msg ||
        payload?.error_description ||
        payload?.message ||
        payload?.error ||
        `Falha na autenticação (${response.status})`;

      return {
        data: { user: null, session: null },
        error: {
          message: String(errorMessage),
          status: response.status,
          statusCode: response.status,
        },
      };
    }

    if (!payload?.access_token || !payload?.refresh_token) {
      return {
        data: { user: null, session: null },
        error: {
          message: "Resposta de autenticação inválida recebida do Supabase.",
        },
      };
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });

    return {
      data: {
        user: data.user,
        session: data.session,
      },
      error: error ? toAuthLikeError(error) : null,
    };
  } catch (error) {
    return {
      data: { user: null, session: null },
      error: toAuthLikeError(error),
    };
  }
}

export async function signInWithPasswordResilient(
  email: string,
  password: string,
): Promise<ResilientSignInResult> {
  // =====================================================
  // Tentativa 1: SDK padrão do Supabase
  // =====================================================
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error) {
      console.info("[auth] Login via SDK padrão OK");
      return {
        data: {
          user: data.user,
          session: data.session,
        },
        error: null,
      };
    }

    if (!isNetworkAuthError(error)) {
      return {
        data: {
          user: data.user,
          session: data.session,
        },
        error: toAuthLikeError(error),
      };
    }

    console.warn("[auth] SDK falhou com erro de rede, tentando fallbacks...", {
      origin: window.location.origin,
      online: navigator.onLine,
    });
  } catch (error) {
    if (!isNetworkAuthError(error)) {
      throw error;
    }

    console.warn("[auth] SDK lançou erro de rede, tentando fallbacks...", {
      origin: window.location.origin,
      online: navigator.onLine,
    });
  }

  // Limpar artefatos antes dos fallbacks
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // noop
  }
  clearLocalAuthArtifacts();

  // =====================================================
  // Tentativa 2: XMLHttpRequest (bypass do proxy do Preview)
  // =====================================================
  const xhrResult = await signInWithXHR(email, password);
  if (!xhrResult.error) {
    console.info("[auth] Login via XMLHttpRequest OK");
    return xhrResult;
  }

  console.warn("[auth] XMLHttpRequest falhou, tentando fetch direto...", xhrResult.error);

  // =====================================================
  // Tentativa 3: fetch direto como último recurso
  // =====================================================
  const fetchResult = await signInWithDirectFetch(email, password);

  if (fetchResult.error) {
    console.error("[auth] Todos os métodos de login falharam", {
      origin: window.location.origin,
      online: navigator.onLine,
      xhrError: xhrResult.error,
      fetchError: fetchResult.error,
    });
  } else {
    console.info("[auth] Login via fetch direto OK");
  }

  return fetchResult;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

async function readJsonOrText(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.replace(/\s+/g, " ").trim().substring(0, 300) };
  }
}

async function loadMediaPayload(mediaUrl: string, fallbackFileName: string): Promise<{ media: string; mimetype: string; fileName: string }> {
  if (!/^https?:\/\//i.test(mediaUrl)) {
    return { media: mediaUrl, mimetype: "image/jpeg", fileName: fallbackFileName };
  }

  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error(`Falha ao baixar mídia ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return { media: btoa(binary), mimetype: contentType, fileName: fallbackFileName.replace(/\.[a-z0-9]+$/i, "") + "." + extension };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const { action, tenant_id, message, phone, mediaUrl, caption, tagId, buttonActions } = await req.json();

    console.log(`[${timestamp}] [zapi-proxy] Action: ${action}, Tenant: ${tenant_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Z-API integration config for this tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, is_active, provider")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError) {
      console.error("[zapi-proxy] Error fetching integration:", integrationError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configuração de integração" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notConfiguredPayload = (reason: string) => {
      // For UI stability: do not return 4xx for read/status-like actions when WhatsApp isn't configured.
      // This prevents pages that auto-fetch groups/status from crashing or showing disruptive errors.
      if (action === "status") {
        return {
          connected: false,
          status: "not_configured",
          message: reason,
        };
      }

      if (action === "list-groups") {
        return [];
      }

      if (action === "list-tags") {
        return [];
      }

      return {
        error: "Integração WhatsApp não configurada",
        message: reason,
      };
    };

    if (!integration) {
      const payload = notConfiguredPayload(
        "Configure as credenciais Z-API nas configurações"
      );
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (integration.provider === "uazapi") {
      const uazUrl = (integration.uazapi_url || "").replace(/\/+$/, "");
      const uazTok = integration.uazapi_token || "";
      if (!uazUrl || !uazTok) {
        return new Response(JSON.stringify(notConfiguredPayload("uazapi não configurada")), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const uazH: Record<string, string> = { "Content-Type": "application/json", "token": uazTok };

      if (action === "status") {
        try {
          const res = await fetch(`${uazUrl}/instance/status`, { method: "GET", headers: uazH });
          const data = await res.json().catch(() => null);
          const inst = data?.instance || data;
          const state = inst?.status || "";
          const connected = state === "connected";
          const ownerJid = inst?.owner || inst?.wid || "";
          const phoneStr = ownerJid ? String(ownerJid).split("@")[0] : undefined;
          return new Response(JSON.stringify({ connected, status: state, user: phoneStr ? { phone: phoneStr } : undefined }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ connected: false, status: "error", error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "list-groups") {
        try {
          const res = await fetch(`${uazUrl}/group/list`, { method: "GET", headers: uazH });
          const data = await res.json().catch(() => []);
          const groups: any[] = Array.isArray(data) ? data : (data?.groups || []);
          const normalized = groups.map((g: any) => ({
            id: g.id || g.jid || g.remoteJid || "",
            name: g.subject || g.name || g.id || "",
            isGroup: true,
            participantCount: g.size || g.participantsCount || (g.participants?.length || 0),
            lastMessageTime: String(g.creation || g.subjectTime || "0"),
          })).filter((g: any) => g.id).sort((a: any, b: any) => parseInt(b.lastMessageTime) - parseInt(a.lastMessageTime));
          return new Response(JSON.stringify(normalized), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "disconnect" || action === "stop") {
        try {
          await fetch(`${uazUrl}/instance/disconnect`, { method: "POST", headers: uazH });
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "send-text" || action === "send-group") {
        try {
          const resp = await fetch(`${uazUrl}/send/text`, { method: "POST", headers: uazH, body: JSON.stringify({ number: phone, text: message }) });
          const data = await readJsonOrText(resp);
          return new Response(JSON.stringify({ sent: resp.ok, messageId: data?.id || data?.messageid, error: resp.ok ? undefined : data?.raw || data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ sent: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "send-image" || action === "send-group-image") {
        try {
          const resp = await fetch(`${uazUrl}/send/media`, { method: "POST", headers: uazH, body: JSON.stringify({ number: phone, type: "image", file: mediaUrl, text: caption || "" }) });
          const data = await readJsonOrText(resp);
          return new Response(JSON.stringify({ sent: resp.ok, messageId: data?.id || data?.messageid, error: resp.ok ? undefined : data?.raw || data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ sent: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "send-button-actions") {
        try {
          const linkUrl = Array.isArray(buttonActions) && buttonActions[0]?.url ? buttonActions[0].url : "";
          const fullMsg = linkUrl ? `${message}\n\n🔗 ${linkUrl}` : message;
          const resp = await fetch(`${uazUrl}/send/text`, { method: "POST", headers: uazH, body: JSON.stringify({ number: phone, text: fullMsg }) });
          return new Response(JSON.stringify({ sent: resp.ok }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ sent: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "group-metadata") {
        try {
          const resp = await fetch(`${uazUrl}/group/info`, { method: "POST", headers: uazH, body: JSON.stringify({ groupjid: phone }) });
          const data = await resp.json().catch(() => null);
          return new Response(JSON.stringify(data || {}), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "profile-picture") {
        try {
          const resp = await fetch(`${uazUrl}/contact/picture`, { method: "POST", headers: uazH, body: JSON.stringify({ number: phone }) });
          const data = await resp.json().catch(() => null);
          return new Response(JSON.stringify({ profilePictureUrl: data?.profilePictureUrl || data?.url || data?.picture || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ profilePictureUrl: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "qr-code" || action === "get_qr") {
        try {
          const resp = await fetch(`${uazUrl}/instance/connect`, { method: "POST", headers: uazH, body: JSON.stringify({}) });
          const data = await resp.json().catch(() => null);
          const inst = data?.instance || data;
          const qr = inst?.qrcode || null;
          return new Response(JSON.stringify({ value: qr, qrcode: qr, base64: qr, pairCode: inst?.paircode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ value: null, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "restart") {
        try {
          await fetch(`${uazUrl}/instance/disconnect`, { method: "POST", headers: uazH });
          const resp = await fetch(`${uazUrl}/instance/connect`, { method: "POST", headers: uazH, body: JSON.stringify({}) });
          return new Response(JSON.stringify({ success: resp.ok }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "send-document") {
        try {
          const resp = await fetch(`${uazUrl}/send/media`, { method: "POST", headers: uazH, body: JSON.stringify({ number: phone, type: "document", file: mediaUrl, docName: "documento.pdf" }) });
          const data = await readJsonOrText(resp);
          return new Response(JSON.stringify({ sent: resp.ok, messageId: data?.id || data?.messageid, error: resp.ok ? undefined : data?.raw || data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ sent: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (action === "list-tags") {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "add-tag") {
        return new Response(JSON.stringify({ success: false, error: "Tags não suportadas na uazapi via proxy" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const payload = notConfiguredPayload("Ação não suportada para uazapi via zapi-proxy");
      return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (integration.provider !== "zapi") {
      const payload = notConfiguredPayload("Esta integração não está configurada para Z-API");
      return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!integration.zapi_instance_id || !integration.zapi_token) {
      const payload = notConfiguredPayload(
        "Configure Instance ID e Token nas configurações"
      );
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceId = integration.zapi_instance_id;
    const token = integration.zapi_token;
    const clientToken = integration.zapi_client_token;
    const baseUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}`;

    let endpoint = "";
    let method = "GET";
    let body: any = null;

    switch (action) {
      case "status":
        endpoint = "/status";
        method = "GET";
        break;

      case "qr-code":
      case "get_qr":
        endpoint = "/qr-code/image";
        method = "GET";
        break;

      case "disconnect":
      case "stop":
        endpoint = "/disconnect";
        method = "GET";
        break;

      case "restart":
        endpoint = "/restart";
        method = "GET";
        break;

      case "send-text":
        endpoint = "/send-text";
        method = "POST";
        body = {
          phone: phone,
          message: message
        };
        break;

      case "send-image":
        endpoint = "/send-image";
        method = "POST";
        body = {
          phone: phone,
          image: mediaUrl,
          caption: caption || ""
        };
        break;

      case "send-button-actions":
        // Z-API: /send-button-actions — mensagem com até 3 botões (URL/CALL/REPLY)
        if (!Array.isArray(buttonActions) || buttonActions.length === 0) {
          return new Response(
            JSON.stringify({ error: "buttonActions é obrigatório para send-button-actions" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        endpoint = "/send-button-actions";
        method = "POST";
        body = {
          phone: phone,
          message: message,
          buttonActions: buttonActions
        };
        break;

      case "send-document":
        endpoint = "/send-document";
        method = "POST";
        body = {
          phone: phone,
          document: mediaUrl
        };
        break;


      case "list-groups": {
        // Fetch ALL groups using pagination - Z-API requires iterating through pages
        const allGroups: any[] = [];
        let currentPage = 1;
        const pageSize = 100; // Max groups per page
        let hasMore = true;
        
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (clientToken) headers["Client-Token"] = clientToken;
        
        console.log(`[zapi-proxy] Fetching all groups with pagination...`);
        
        while (hasMore) {
          const pageUrl = `${baseUrl}/groups?page=${currentPage}&pageSize=${pageSize}`;
          console.log(`[zapi-proxy] Fetching page ${currentPage}: ${pageUrl}`);
          
          try {
            const pageResponse = await fetch(pageUrl, { method: "GET", headers });
            const pageData = await pageResponse.json();
            
            if (Array.isArray(pageData) && pageData.length > 0) {
              allGroups.push(...pageData);
              console.log(`[zapi-proxy] Page ${currentPage}: ${pageData.length} groups (total: ${allGroups.length})`);
              currentPage++;
              
              // If we got less than pageSize, we've reached the end
              if (pageData.length < pageSize) {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          } catch (err) {
            console.error(`[zapi-proxy] Error fetching page ${currentPage}:`, err);
            hasMore = false;
          }
          
          // Safety limit to prevent infinite loops
          if (currentPage > 50) {
            console.warn("[zapi-proxy] Reached page limit (50), stopping pagination");
            hasMore = false;
          }
        }
        
        console.log(`[zapi-proxy] Total groups fetched: ${allGroups.length}`);
        
        // Sort by lastMessageTime descending (most recent first)
        allGroups.sort((a, b) => {
          const timeA = parseInt(a.lastMessageTime || "0", 10);
          const timeB = parseInt(b.lastMessageTime || "0", 10);
          return timeB - timeA; // Descending order
        });
        
        console.log(`[zapi-proxy] Groups sorted by lastMessageTime (most recent first)`);
        
        return new Response(
          JSON.stringify(allGroups),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "group-metadata":
        if (!phone) {
          return new Response(
            JSON.stringify({ error: "phone (groupId) é obrigatório para group-metadata" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        endpoint = `/group-metadata/${phone}`;
        method = "GET";
        break;

      case "send-group":
        endpoint = "/send-text";
        method = "POST";
        body = {
          phone: phone, // groupId
          message: message
        };
        break;

      case "send-group-image":
        endpoint = "/send-image";
        method = "POST";
        body = {
          phone: phone, // groupId
          image: mediaUrl,
          caption: caption || ""
        };
        break;

      case "list-tags":
        // Z-API: /labels retorna as Etiquetas do WhatsApp Business (criadas no celular).
        // /tags retorna os Filtros nativos do WhatsApp (Não lidas, Favoritos, Grupos).
        endpoint = "/labels";
        method = "GET";
        break;

      case "add-tag":
        if (!phone || !tagId) {
          return new Response(
            JSON.stringify({ error: "phone e tagId são obrigatórios para add-tag" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Z-API: PUT /labels/{labelId}/add/{phone} adiciona etiqueta ao contato.
        endpoint = `/labels/${tagId}/add/${phone}`;
        method = "PUT";
        break;

      case "profile-picture":
        if (!phone) {
          return new Response(
            JSON.stringify({ error: "phone é obrigatório para profile-picture" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Z-API endpoint correto: GET /profile-picture?phone={phone}
        endpoint = `/profile-picture?phone=${phone}`;
        method = "GET";
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const targetUrl = `${baseUrl}${endpoint}`;
    console.log(`[zapi-proxy] Calling: ${method} ${targetUrl}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    // Add Client-Token header if configured
    if (clientToken) {
      headers["Client-Token"] = clientToken;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method === "POST") {
      fetchOptions.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: "Timeout: Z-API demorou muito para responder",
            status: "timeout"
          }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Não foi possível conectar à Z-API",
          message: fetchError.message,
          status: "connection_error"
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[zapi-proxy] Response status: ${response.status}`);

    // Handle QR code response
    if (action === "qr-code" || action === "get_qr") {
      // If response is binary image
      if (contentType.includes("image")) {
        const imageBuffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const mimeType = contentType.split(";")[0];
        
        return new Response(
          JSON.stringify({ 
            qrCode: `data:${mimeType};base64,${base64}`,
            status: "qr_ready",
            hasQR: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // If response is JSON (Z-API sometimes returns base64 in JSON)
      try {
        const text = await response.text();
        console.log("[zapi-proxy] QR Response body:", text.substring(0, 500));
        const data = JSON.parse(text);
        
        // Z-API returns { value: "data:image/png;base64,..." }
        if (data.value && data.value.startsWith("data:image")) {
          return new Response(
            JSON.stringify({ 
              qrCode: data.value,
              status: "qr_ready",
              hasQR: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Connected or other status
        if (data.connected) {
          return new Response(
            JSON.stringify({ 
              status: "connected",
              message: "WhatsApp já está conectado",
              connected: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: "QR Code não disponível",
            message: data.error || "Tente novamente em alguns segundos",
            raw: data
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ 
            error: "Resposta inválida da Z-API",
            status: "parse_error"
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Parse JSON response for other actions
    let data;
    try {
      const text = await response.text();
      console.log("[zapi-proxy] Response body:", text.substring(0, 500));
      data = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ 
          error: "Resposta inválida da Z-API",
          status: "parse_error"
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle Z-API "not connected" error gracefully for read-only actions
    // This prevents UI crashes when WhatsApp is not connected
    if (!response.ok && data?.error === "You need to be connected with whatsapp") {
      console.log("[zapi-proxy] WhatsApp not connected, returning safe payload for action:", action);
      
      if (action === "status") {
        return new Response(
          JSON.stringify({
            connected: false,
            status: "disconnected",
            message: "WhatsApp não conectado",
            user: null
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "list-groups") {
        return new Response(
          JSON.stringify([]),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "list-tags") {
        return new Response(
          JSON.stringify([]),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For other actions that require connection, return a user-friendly error
      return new Response(
        JSON.stringify({
          error: "WhatsApp não conectado",
          message: "Conecte o WhatsApp primeiro para usar esta função",
          status: "disconnected"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map Z-API status to our format
    if (action === "status") {
      const isConnected = data.connected === true || data.smartphoneConnected === true;

      // Z-API /status nem sempre traz phoneConnected. Quando conectado, buscar /device
      // para descobrir o número emparelhado (campo "phone" no retorno do /device).
      let phoneConnected: string | null = data.phoneConnected || null;
      if (isConnected && !phoneConnected) {
        try {
          const devHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (clientToken) devHeaders["Client-Token"] = clientToken;
          const devRes = await fetch(`${baseUrl}/device`, { method: "GET", headers: devHeaders });
          if (devRes.ok) {
            const devData = await devRes.json().catch(() => null);
            phoneConnected = devData?.phone || devData?.phoneConnected || devData?.me?.user || null;
          }
        } catch (e) {
          console.warn("[zapi-proxy] Falha ao buscar /device:", (e as any)?.message);
        }
      }

      if (isConnected && phoneConnected) {
        await supabase
          .from("integration_whatsapp")
          .update({
            connected_phone: phoneConnected,
            last_status_check: new Date().toISOString(),
          })
          .eq("tenant_id", tenant_id);
      }

      return new Response(
        JSON.stringify({
          connected: isConnected,
          status: isConnected ? "connected" : "disconnected",
          message: isConnected ? "WhatsApp conectado via Z-API" : "WhatsApp desconectado",
          user: phoneConnected ? { phone: phoneConnected } : null,
          raw: data,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normaliza resposta de list-tags (Z-API /labels) para sempre devolver array de {id, name, color}
    if (action === "list-tags") {
      let arr: any[] = [];
      if (Array.isArray(data)) arr = data;
      else if (Array.isArray(data?.labels)) arr = data.labels;
      else if (Array.isArray(data?.value)) arr = data.value;
      else if (Array.isArray(data?.tags)) arr = data.tags;

      const normalized = arr.map((t: any) => ({
        id: String(t.id ?? t.labelId ?? t.value ?? ""),
        name: t.name ?? t.label ?? t.title ?? "Sem nome",
        color: typeof t.color === "number" ? t.color : 0,
        colorHex: t.colorHex ?? t.hexColor ?? null,
      })).filter((t: any) => t.id);

      return new Response(
        JSON.stringify(normalized),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      {
        status: response.ok ? 200 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error("[zapi-proxy] Error:", error.message);
    
    return new Response(
      JSON.stringify({ 
        error: `Erro interno: ${error.message}`,
        status: "internal_error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

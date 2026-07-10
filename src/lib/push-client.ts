import { supabase } from '@/integrations/supabase/client';

const SW_URL = '/push-sw.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIosSafariNotStandalone(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !isStandalone;
}

export async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_URL);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch (e) {
    console.error('[push] register failed', e);
    return null;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getPushRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('push-vapid-public-key');
    if (error) return null;
    return (data as any)?.publicKey || null;
  } catch { return null; }
}

export interface SubscribeArgs {
  tenantId: string;
  name?: string;
  phone?: string;
  instagramHandle?: string;
  customerId?: number | null;
}

export async function subscribePush(args: SubscribeArgs): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Navegador não suporta notificações push.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, error: 'Permissão negada.' };
  const reg = await getPushRegistration();
  if (!reg) return { ok: false, error: 'Não foi possível registrar o Service Worker.' };
  const publicKey = await fetchPublicKey();
  if (!publicKey) return { ok: false, error: 'Chave VAPID indisponível.' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const json = sub.toJSON();
  const { data, error } = await supabase.functions.invoke('push-subscribe', {
    body: {
      tenant_id: args.tenantId,
      customer_id: args.customerId ?? null,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      name: args.name || null,
      phone: args.phone || null,
      instagram_handle: args.instagramHandle || null,
    },
  });
  if (error || (data as any)?.success === false) {
    return { ok: false, error: (data as any)?.error || error?.message || 'Falha ao salvar' };
  }
  return { ok: true };
}

export async function unsubscribePush(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  try {
    await supabase.functions.invoke('push-unsubscribe', { body: { endpoint: sub.endpoint } });
  } catch {}
  try { await sub.unsubscribe(); } catch {}
}

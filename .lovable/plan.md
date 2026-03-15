

## Plan: Restrict Fluxo de Envio + Fix Vídeo Redondo (PTV)

### Current State
- **Navbar**: Already hides "Fluxo de Envio" for non-`app` tenants (line 33), but the **route itself is still accessible** by typing `/fluxo-envio` directly.
- **PTV**: The `fe-send-message` function already calls Z-API's `/send-ptv` endpoint, but the payload format may need adjustment for proper circular video delivery.

### Changes

**1. Route-level restriction** (`src/App.tsx`)
- Wrap the `/fluxo-envio` route with a conditional that checks tenant slug is `app` or user is super_admin. Redirect others to `/pedidos`.

**2. Verify and fix PTV payload** (`supabase/functions/fe-send-message/index.ts`)
- Z-API's `/send-ptv` endpoint expects `{ phone, video: mediaUrl }` — not `{ phone, ptv: mediaUrl }`. The field name `ptv` is the endpoint path, but the body field should be `video`. This is likely why the circular video isn't being delivered correctly.
- Update the `video_note` case to use the correct body format.

### Technical Details

**Route guard** — Add slug check inside the `RequireTenantAuth` wrapper or create an inline guard:
```tsx
<Route path="/fluxo-envio" element={
  <RequireTenantAuth allowedSlugs={['app']}>
    <FluxoEnvio />
  </RequireTenantAuth>
} />
```
Alternatively, a simpler approach: add a check inside `FluxoEnvioIndex` itself that redirects if tenant slug isn't `app` and user isn't super_admin.

**PTV fix** — Change the edge function payload:
```typescript
case "video_note": {
  const res = await fetch(`${baseUrl}/send-ptv`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, video: mediaUrl }),
  });
  return res;
}
```

### Files to modify
- `src/pages/fluxo-envio/Index.tsx` — Add tenant/role guard with redirect
- `supabase/functions/fe-send-message/index.ts` — Fix PTV payload field name


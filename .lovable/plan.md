

## Plan: Aba "LIVE" com comentários em tempo real no Instagram

### Overview
Create a "LIVE" tab inside the Instagram integration page that displays live comments from Instagram in real-time using Supabase Realtime subscriptions.

### Database Changes

**New table `instagram_live_comments`** to store comments received via the webhook:

```sql
CREATE TABLE public.instagram_live_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text,
  comment_text text NOT NULL,
  comment_id text,
  media_id text,
  is_live boolean DEFAULT false,
  product_code text,
  product_found boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.instagram_live_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant users can view their live comments"
  ON public.instagram_live_comments FOR SELECT
  USING (tenant_id = get_current_tenant_id() OR is_super_admin());

CREATE POLICY "Service role can insert live comments"
  ON public.instagram_live_comments FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_live_comments;

-- Index for performance
CREATE INDEX idx_instagram_live_comments_tenant ON public.instagram_live_comments(tenant_id, created_at DESC);
```

### Edge Function Update

**`supabase/functions/instagram-webhook/index.ts`**: After extracting the comment data (around line 163), insert a row into `instagram_live_comments` with `username`, `comment_text`, `media_id`, `is_live`, and the extracted `product_code` (if any). This happens before the product lookup logic, so all comments are captured regardless of whether they contain a valid product code.

### New Component

**`src/components/integrations/InstagramLiveComments.tsx`**: A panel that:
- Subscribes to Supabase Realtime on the `instagram_live_comments` table filtered by `tenant_id`
- Shows a scrollable list of comments in real-time (auto-scrolls to bottom)
- Each comment shows: avatar placeholder, `@username`, comment text, timestamp, and a badge if a product code was detected
- Includes a "Limpar" button to clear old comments
- Shows a pulsing red dot indicator when "listening" for comments
- Displays a message "Aguardando comentários da sua Live..." when empty

### UI Integration

**`src/components/integrations/InstagramIntegration.tsx`**: When the account is connected (`isConnected === true`), wrap the existing content in Tabs with two tabs:
1. **Configuração** (default) -- current content (status card, webhook URL, how-it-works alert)
2. **LIVE** -- the new `InstagramLiveComments` component

### Technical Details

- Realtime subscription uses `supabase.channel()` with `.on('postgres_changes', { event: 'INSERT', table: 'instagram_live_comments', filter: 'tenant_id=eq.{tenantId}' })`
- Component keeps last 100 comments in state, newest at the bottom
- Initial load fetches the 50 most recent comments via a query
- Cleanup: unsubscribe from the channel on unmount


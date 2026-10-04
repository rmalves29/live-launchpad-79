-- Interruptor da Loja da Live por empresa (o link /t/{slug}/live existe para todas; a empresa pode desligar).
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS live_shop_enabled boolean NOT NULL DEFAULT true;

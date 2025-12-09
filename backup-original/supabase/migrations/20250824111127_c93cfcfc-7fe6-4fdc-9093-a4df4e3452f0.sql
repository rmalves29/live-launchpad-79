-- Add printed flag to cart_items for per-item print control
ALTER TABLE public.cart_items
ADD COLUMN IF NOT EXISTS printed boolean NOT NULL DEFAULT false;
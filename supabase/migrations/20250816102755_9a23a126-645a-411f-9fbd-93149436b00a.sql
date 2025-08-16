-- Create products table
CREATE TABLE public.products (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  weight_kg NUMERIC(10,3) DEFAULT 0.2,
  length_cm NUMERIC(10,2) DEFAULT 20,
  height_cm NUMERIC(10,2) DEFAULT 4,
  width_cm NUMERIC(10,2) DEFAULT 16,
  diameter_cm NUMERIC(10,2) DEFAULT 0
);

-- Create carts table
CREATE TABLE public.carts (
  id BIGSERIAL PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  customer_instagram TEXT,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cart_items table
CREATE TABLE public.cart_items (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT REFERENCES public.carts(id) ON DELETE SET NULL,
  customer_phone TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  payment_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (placeholder policies - no auth required for now)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for all operations (since this is an admin system)
CREATE POLICY "products_all_access" ON public.products FOR ALL USING (true);
CREATE POLICY "carts_all_access" ON public.carts FOR ALL USING (true);
CREATE POLICY "cart_items_all_access" ON public.cart_items FOR ALL USING (true);
CREATE POLICY "orders_all_access" ON public.orders FOR ALL USING (true);

-- Insert some sample products for testing
INSERT INTO public.products (code, name, price, stock) VALUES
('C001', 'Produto Exemplo 1', 29.90, 10),
('C002', 'Produto Exemplo 2', 49.90, 5),
('C003', 'Produto Exemplo 3', 19.90, 15);
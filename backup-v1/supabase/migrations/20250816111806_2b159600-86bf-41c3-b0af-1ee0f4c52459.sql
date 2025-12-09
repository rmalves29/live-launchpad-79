-- Enable RLS on all public tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create basic policies for products (public read, authenticated write)
CREATE POLICY "Anyone can view active products" 
ON public.products 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage products" 
ON public.products 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create policies for carts (users can only see their own carts)
CREATE POLICY "Users can view their own carts" 
ON public.carts 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create their own carts" 
ON public.carts 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own carts" 
ON public.carts 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Create policies for cart_items
CREATE POLICY "Users can view cart items" 
ON public.cart_items 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage cart items" 
ON public.cart_items 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create policies for orders
CREATE POLICY "Users can view orders" 
ON public.orders 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update orders" 
ON public.orders 
FOR UPDATE 
USING (auth.role() = 'authenticated');
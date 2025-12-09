-- Relax policies to work without Supabase Auth (since app uses local auth)

-- Products: allow public full CRUD (admin-only app)
CREATE POLICY "Public can view all products"
ON public.products
FOR SELECT
USING (true);

CREATE POLICY "Public can insert products"
ON public.products
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update products"
ON public.products
FOR UPDATE
USING (true);

-- Storage: allow anon uploads to product-images bucket
CREATE POLICY "Anon can upload product images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Anon can update product images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'product-images');

CREATE POLICY "Anon can delete product images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'product-images');
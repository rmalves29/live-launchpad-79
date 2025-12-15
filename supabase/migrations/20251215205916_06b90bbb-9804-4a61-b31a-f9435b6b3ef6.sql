-- Criar bucket para logos de tenants
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-logos', 'tenant-logos', true);

-- Policy para permitir upload público (admin pode fazer upload)
CREATE POLICY "Anyone can view tenant logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-logos');

-- Policy para permitir upload autenticado
CREATE POLICY "Authenticated users can upload tenant logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tenant-logos' AND auth.role() = 'authenticated');

-- Policy para permitir update
CREATE POLICY "Authenticated users can update tenant logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tenant-logos' AND auth.role() = 'authenticated');

-- Policy para permitir delete
CREATE POLICY "Authenticated users can delete tenant logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'tenant-logos' AND auth.role() = 'authenticated');
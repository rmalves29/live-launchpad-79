-- Tornar o bucket product-images público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'product-images';
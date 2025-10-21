-- Add color and size variations to products table
ALTER TABLE public.products 
ADD COLUMN color TEXT,
ADD COLUMN size TEXT;
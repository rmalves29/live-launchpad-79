-- Add new columns to orders table
ALTER TABLE public.orders 
ADD COLUMN printed BOOLEAN DEFAULT FALSE,
ADD COLUMN observation TEXT;
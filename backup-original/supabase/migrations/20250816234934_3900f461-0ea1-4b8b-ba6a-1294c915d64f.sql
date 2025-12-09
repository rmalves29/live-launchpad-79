-- Create customers table
CREATE TABLE public.customers (
  id bigserial PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  name text NOT NULL,
  cpf text,
  street text,
  number text,
  complement text,
  city text,
  state text,
  cep text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public access (since this is for customer management)
CREATE POLICY "Anyone can view customers" 
ON public.customers 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update customers" 
ON public.customers 
FOR UPDATE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_customers_updated_at();
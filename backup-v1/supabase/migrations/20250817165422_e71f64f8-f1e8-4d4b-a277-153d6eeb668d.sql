-- Create or ensure timestamp trigger function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- App settings singleton table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_base_url text,
  correios_origin_cep text,
  correios_service_pac text DEFAULT '3298',
  correios_service_sedex text DEFAULT '3220',
  default_weight_kg numeric DEFAULT 0.3,
  default_length_cm integer DEFAULT 20,
  default_height_cm integer DEFAULT 2,
  default_width_cm integer DEFAULT 16,
  default_diameter_cm integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'Everyone can read app settings'
  ) THEN
    CREATE POLICY "Everyone can read app settings"
    ON public.app_settings
    FOR SELECT
    USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'Authenticated can upsert app settings'
  ) THEN
    CREATE POLICY "Authenticated can upsert app settings"
    ON public.app_settings
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'Authenticated can update app settings'
  ) THEN
    CREATE POLICY "Authenticated can update app settings"
    ON public.app_settings
    FOR UPDATE
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Trigger for timestamps
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_app_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Ensure singleton row exists
INSERT INTO public.app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- WhatsApp templates table
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id bigserial PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('ITEM_ADDED','PRODUCT_CANCELED','BROADCAST')),
  title text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_type_unique UNIQUE (type)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'whatsapp_templates' AND policyname = 'Everyone can read templates'
  ) THEN
    CREATE POLICY "Everyone can read templates"
    ON public.whatsapp_templates
    FOR SELECT
    USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'whatsapp_templates' AND policyname = 'Authenticated can manage templates'
  ) THEN
    CREATE POLICY "Authenticated can manage templates"
    ON public.whatsapp_templates
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Trigger for timestamps on templates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_whatsapp_templates_updated_at'
  ) THEN
    CREATE TRIGGER update_whatsapp_templates_updated_at
    BEFORE UPDATE ON public.whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
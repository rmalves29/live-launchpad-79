CREATE OR REPLACE FUNCTION public.sync_storage_file_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só processar quando image_url realmente muda (INSERT ou UPDATE)
  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
    RETURN NEW;
  END IF;

  IF NEW.image_url IS NOT NULL AND NEW.image_url ILIKE '%product-images%' THEN
    INSERT INTO public.storage_file_references (storage_name, bucket_id, tenant_id, product_id, source_table, source_column)
    VALUES (
      regexp_replace(NEW.image_url, '^.*/product-images/', ''),
      'product-images',
      NEW.tenant_id,
      NEW.id,
      'products',
      'image_url'
    )
    ON CONFLICT (storage_name, bucket_id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          product_id = EXCLUDED.product_id;
  END IF;

  RETURN NEW;
END;
$$;
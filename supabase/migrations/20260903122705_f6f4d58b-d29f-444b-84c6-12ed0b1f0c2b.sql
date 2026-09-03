UPDATE public.orders
SET tracking_posted = false,
    order_status = CASE WHEN order_status = 'enviado' THEN NULL ELSE order_status END,
    shipped_at = NULL
WHERE tracking_posted = true
  AND melhor_envio_tracking_code IS NOT NULL
  AND melhor_envio_shipment_id IS NULL
  AND created_at >= '2026-09-03T00:00:00-03:00';
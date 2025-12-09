-- Deduplicate unpaid orders per phone/date and enforce single unpaid order per day
BEGIN;

-- 1) Merge duplicate unpaid orders (same phone and date) keeping the most recent
DO $$
DECLARE
  r RECORD;
  main_order RECORD;
  ord RECORD;
BEGIN
  FOR r IN
    SELECT customer_phone, event_date
    FROM public.orders
    WHERE is_paid = false
    GROUP BY customer_phone, event_date
    HAVING COUNT(*) > 1
  LOOP
    -- pick most recent as main
    SELECT o.* INTO main_order
    FROM public.orders o
    WHERE o.customer_phone = r.customer_phone
      AND o.event_date = r.event_date
      AND o.is_paid = false
    ORDER BY o.created_at DESC
    LIMIT 1;

    -- ensure main has a cart if any duplicate has one
    IF main_order.cart_id IS NULL THEN
      SELECT o.cart_id INTO main_order.cart_id
      FROM public.orders o
      WHERE o.customer_phone = r.customer_phone
        AND o.event_date = r.event_date
        AND o.is_paid = false
        AND o.cart_id IS NOT NULL
      ORDER BY o.created_at DESC
      LIMIT 1;

      IF main_order.cart_id IS NOT NULL THEN
        UPDATE public.orders SET cart_id = main_order.cart_id WHERE id = main_order.id;
      END IF;
    END IF;

    -- merge each other order into main
    FOR ord IN
      SELECT o.*
      FROM public.orders o
      WHERE o.customer_phone = r.customer_phone
        AND o.event_date = r.event_date
        AND o.is_paid = false
        AND o.id <> main_order.id
      ORDER BY o.created_at ASC
    LOOP
      -- move cart items to main cart
      IF ord.cart_id IS NOT NULL THEN
        IF main_order.cart_id IS NULL THEN
          UPDATE public.orders SET cart_id = ord.cart_id WHERE id = main_order.id;
          SELECT * INTO main_order FROM public.orders WHERE id = main_order.id; -- refresh record
        ELSIF ord.cart_id <> main_order.cart_id THEN
          UPDATE public.cart_items SET cart_id = main_order.cart_id WHERE cart_id = ord.cart_id;
          -- delete old cart after moving items
          DELETE FROM public.carts WHERE id = ord.cart_id;
        END IF;
      END IF;

      -- accumulate totals
      UPDATE public.orders
        SET total_amount = COALESCE((SELECT total_amount FROM public.orders WHERE id = main_order.id),0) + COALESCE(ord.total_amount,0)
      WHERE id = main_order.id;
      
      -- delete the duplicate order
      DELETE FROM public.orders WHERE id = ord.id;
    END LOOP;
  END LOOP;
END $$;

-- 2) Enforce uniqueness: only one unpaid order per (phone, date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_unpaid_order_per_day
ON public.orders (customer_phone, event_date)
WHERE is_paid = false;

COMMIT;
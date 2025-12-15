-- Backfill existing cart_items with product data from products table
UPDATE cart_items 
SET 
  product_name = products.name,
  product_code = products.code,
  product_image_url = products.image_url
FROM products 
WHERE cart_items.product_id = products.id 
  AND (cart_items.product_name IS NULL OR cart_items.product_name = '');
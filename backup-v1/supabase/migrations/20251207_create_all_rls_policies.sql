-- =====================================================
-- CRIAÇÃO AUTOMÁTICA DE RLS POLICIES PARA TODAS AS TABELAS
-- =====================================================
-- Este script cria policies de isolamento por tenant para todas as tabelas

-- =====================================================
-- MACRO: Template para criar policies
-- =====================================================
-- Para cada tabela com tenant_id, execute este bloco substituindo TABLE_NAME

-- ====== CUSTOMERS ======
DROP POLICY IF EXISTS "tenant_isolation_customers_select" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_insert" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_update" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_delete" ON customers;

CREATE POLICY "tenant_isolation_customers_select" ON customers FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_insert" ON customers FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_update" ON customers FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_delete" ON customers FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== CUSTOMER_TAGS ======
DROP POLICY IF EXISTS "tenant_isolation_customer_tags_select" ON customer_tags;
DROP POLICY IF EXISTS "tenant_isolation_customer_tags_insert" ON customer_tags;
DROP POLICY IF EXISTS "tenant_isolation_customer_tags_update" ON customer_tags;
DROP POLICY IF EXISTS "tenant_isolation_customer_tags_delete" ON customer_tags;

CREATE POLICY "tenant_isolation_customer_tags_select" ON customer_tags FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tags_insert" ON customer_tags FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tags_update" ON customer_tags FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tags_delete" ON customer_tags FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== CUSTOMER_TAG_ASSIGNMENTS ======
DROP POLICY IF EXISTS "tenant_isolation_customer_tag_assignments_select" ON customer_tag_assignments;
DROP POLICY IF EXISTS "tenant_isolation_customer_tag_assignments_insert" ON customer_tag_assignments;
DROP POLICY IF EXISTS "tenant_isolation_customer_tag_assignments_update" ON customer_tag_assignments;
DROP POLICY IF EXISTS "tenant_isolation_customer_tag_assignments_delete" ON customer_tag_assignments;

CREATE POLICY "tenant_isolation_customer_tag_assignments_select" ON customer_tag_assignments FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tag_assignments_insert" ON customer_tag_assignments FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tag_assignments_update" ON customer_tag_assignments FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_tag_assignments_delete" ON customer_tag_assignments FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== CUSTOMER_WHATSAPP_GROUPS ======
DROP POLICY IF EXISTS "tenant_isolation_customer_whatsapp_groups_select" ON customer_whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_customer_whatsapp_groups_insert" ON customer_whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_customer_whatsapp_groups_update" ON customer_whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_customer_whatsapp_groups_delete" ON customer_whatsapp_groups;

CREATE POLICY "tenant_isolation_customer_whatsapp_groups_select" ON customer_whatsapp_groups FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_whatsapp_groups_insert" ON customer_whatsapp_groups FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_whatsapp_groups_update" ON customer_whatsapp_groups FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customer_whatsapp_groups_delete" ON customer_whatsapp_groups FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== PRODUCTS ======
DROP POLICY IF EXISTS "tenant_isolation_products_select" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_insert" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_update" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_delete" ON products;

CREATE POLICY "tenant_isolation_products_select" ON products FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_insert" ON products FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_update" ON products FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_delete" ON products FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== PRODUCT_CATEGORIES ======
DROP POLICY IF EXISTS "tenant_isolation_product_categories_select" ON product_categories;
DROP POLICY IF EXISTS "tenant_isolation_product_categories_insert" ON product_categories;
DROP POLICY IF EXISTS "tenant_isolation_product_categories_update" ON product_categories;
DROP POLICY IF EXISTS "tenant_isolation_product_categories_delete" ON product_categories;

CREATE POLICY "tenant_isolation_product_categories_select" ON product_categories FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_categories_insert" ON product_categories FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_categories_update" ON product_categories FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_categories_delete" ON product_categories FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== PRODUCT_IMAGES ======
DROP POLICY IF EXISTS "tenant_isolation_product_images_select" ON product_images;
DROP POLICY IF EXISTS "tenant_isolation_product_images_insert" ON product_images;
DROP POLICY IF EXISTS "tenant_isolation_product_images_update" ON product_images;
DROP POLICY IF EXISTS "tenant_isolation_product_images_delete" ON product_images;

CREATE POLICY "tenant_isolation_product_images_select" ON product_images FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_images_insert" ON product_images FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_images_update" ON product_images FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_images_delete" ON product_images FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== PRODUCT_VARIANTS ======
DROP POLICY IF EXISTS "tenant_isolation_product_variants_select" ON product_variants;
DROP POLICY IF EXISTS "tenant_isolation_product_variants_insert" ON product_variants;
DROP POLICY IF EXISTS "tenant_isolation_product_variants_update" ON product_variants;
DROP POLICY IF EXISTS "tenant_isolation_product_variants_delete" ON product_variants;

CREATE POLICY "tenant_isolation_product_variants_select" ON product_variants FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_variants_insert" ON product_variants FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_variants_update" ON product_variants FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_product_variants_delete" ON product_variants FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== ORDERS ======
DROP POLICY IF EXISTS "tenant_isolation_orders_select" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_insert" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_update" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_delete" ON orders;

CREATE POLICY "tenant_isolation_orders_select" ON orders FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_insert" ON orders FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_update" ON orders FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_delete" ON orders FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== ORDER_ITEMS ======
DROP POLICY IF EXISTS "tenant_isolation_order_items_select" ON order_items;
DROP POLICY IF EXISTS "tenant_isolation_order_items_insert" ON order_items;
DROP POLICY IF EXISTS "tenant_isolation_order_items_update" ON order_items;
DROP POLICY IF EXISTS "tenant_isolation_order_items_delete" ON order_items;

CREATE POLICY "tenant_isolation_order_items_select" ON order_items FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_items_insert" ON order_items FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_items_update" ON order_items FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_items_delete" ON order_items FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== ORDER_STATUS_HISTORY ======
DROP POLICY IF EXISTS "tenant_isolation_order_status_history_select" ON order_status_history;
DROP POLICY IF EXISTS "tenant_isolation_order_status_history_insert" ON order_status_history;
DROP POLICY IF EXISTS "tenant_isolation_order_status_history_update" ON order_status_history;
DROP POLICY IF EXISTS "tenant_isolation_order_status_history_delete" ON order_status_history;

CREATE POLICY "tenant_isolation_order_status_history_select" ON order_status_history FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_status_history_insert" ON order_status_history FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_status_history_update" ON order_status_history FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_order_status_history_delete" ON order_status_history FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== CARTS ======
DROP POLICY IF EXISTS "tenant_isolation_carts_select" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_insert" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_update" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_delete" ON carts;

CREATE POLICY "tenant_isolation_carts_select" ON carts FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_insert" ON carts FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_update" ON carts FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_delete" ON carts FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== CART_ITEMS ======
DROP POLICY IF EXISTS "tenant_isolation_cart_items_select" ON cart_items;
DROP POLICY IF EXISTS "tenant_isolation_cart_items_insert" ON cart_items;
DROP POLICY IF EXISTS "tenant_isolation_cart_items_update" ON cart_items;
DROP POLICY IF EXISTS "tenant_isolation_cart_items_delete" ON cart_items;

CREATE POLICY "tenant_isolation_cart_items_select" ON cart_items FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_cart_items_insert" ON cart_items FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_cart_items_update" ON cart_items FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_cart_items_delete" ON cart_items FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== COUPONS ======
DROP POLICY IF EXISTS "tenant_isolation_coupons_select" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_insert" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_update" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_delete" ON coupons;

CREATE POLICY "tenant_isolation_coupons_select" ON coupons FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_insert" ON coupons FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_update" ON coupons FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_delete" ON coupons FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== COUPON_USAGE ======
DROP POLICY IF EXISTS "tenant_isolation_coupon_usage_select" ON coupon_usage;
DROP POLICY IF EXISTS "tenant_isolation_coupon_usage_insert" ON coupon_usage;
DROP POLICY IF EXISTS "tenant_isolation_coupon_usage_update" ON coupon_usage;
DROP POLICY IF EXISTS "tenant_isolation_coupon_usage_delete" ON coupon_usage;

CREATE POLICY "tenant_isolation_coupon_usage_select" ON coupon_usage FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupon_usage_insert" ON coupon_usage FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupon_usage_update" ON coupon_usage FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupon_usage_delete" ON coupon_usage FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== GIFTS ======
DROP POLICY IF EXISTS "tenant_isolation_gifts_select" ON gifts;
DROP POLICY IF EXISTS "tenant_isolation_gifts_insert" ON gifts;
DROP POLICY IF EXISTS "tenant_isolation_gifts_update" ON gifts;
DROP POLICY IF EXISTS "tenant_isolation_gifts_delete" ON gifts;

CREATE POLICY "tenant_isolation_gifts_select" ON gifts FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_gifts_insert" ON gifts FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_gifts_update" ON gifts FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_gifts_delete" ON gifts FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== FRETE_CONFIG ======
DROP POLICY IF EXISTS "tenant_isolation_frete_config_select" ON frete_config;
DROP POLICY IF EXISTS "tenant_isolation_frete_config_insert" ON frete_config;
DROP POLICY IF EXISTS "tenant_isolation_frete_config_update" ON frete_config;
DROP POLICY IF EXISTS "tenant_isolation_frete_config_delete" ON frete_config;

CREATE POLICY "tenant_isolation_frete_config_select" ON frete_config FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_config_insert" ON frete_config FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_config_update" ON frete_config FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_config_delete" ON frete_config FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== FRETE_COTACOES ======
DROP POLICY IF EXISTS "tenant_isolation_frete_cotacoes_select" ON frete_cotacoes;
DROP POLICY IF EXISTS "tenant_isolation_frete_cotacoes_insert" ON frete_cotacoes;
DROP POLICY IF EXISTS "tenant_isolation_frete_cotacoes_update" ON frete_cotacoes;
DROP POLICY IF EXISTS "tenant_isolation_frete_cotacoes_delete" ON frete_cotacoes;

CREATE POLICY "tenant_isolation_frete_cotacoes_select" ON frete_cotacoes FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_cotacoes_insert" ON frete_cotacoes FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_cotacoes_update" ON frete_cotacoes FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_cotacoes_delete" ON frete_cotacoes FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== FRETE_ENVIOS ======
DROP POLICY IF EXISTS "tenant_isolation_frete_envios_select" ON frete_envios;
DROP POLICY IF EXISTS "tenant_isolation_frete_envios_insert" ON frete_envios;
DROP POLICY IF EXISTS "tenant_isolation_frete_envios_update" ON frete_envios;
DROP POLICY IF EXISTS "tenant_isolation_frete_envios_delete" ON frete_envios;

CREATE POLICY "tenant_isolation_frete_envios_select" ON frete_envios FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_envios_insert" ON frete_envios FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_envios_update" ON frete_envios FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_frete_envios_delete" ON frete_envios FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== WHATSAPP_CONNECTIONS ======
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_connections_select" ON whatsapp_connections;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_connections_insert" ON whatsapp_connections;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_connections_update" ON whatsapp_connections;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_connections_delete" ON whatsapp_connections;

CREATE POLICY "tenant_isolation_whatsapp_connections_select" ON whatsapp_connections FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_connections_insert" ON whatsapp_connections FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_connections_update" ON whatsapp_connections FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_connections_delete" ON whatsapp_connections FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== WHATSAPP_MESSAGES ======
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_select" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_update" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_delete" ON whatsapp_messages;

CREATE POLICY "tenant_isolation_whatsapp_messages_select" ON whatsapp_messages FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_insert" ON whatsapp_messages FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_update" ON whatsapp_messages FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_delete" ON whatsapp_messages FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== WHATSAPP_TEMPLATES ======
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_select" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_insert" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_update" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_delete" ON whatsapp_templates;

CREATE POLICY "tenant_isolation_whatsapp_templates_select" ON whatsapp_templates FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_insert" ON whatsapp_templates FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_update" ON whatsapp_templates FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_delete" ON whatsapp_templates FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== WHATSAPP_CAMPAIGNS ======
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_campaigns_select" ON whatsapp_campaigns;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_campaigns_insert" ON whatsapp_campaigns;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_campaigns_update" ON whatsapp_campaigns;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_campaigns_delete" ON whatsapp_campaigns;

CREATE POLICY "tenant_isolation_whatsapp_campaigns_select" ON whatsapp_campaigns FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_campaigns_insert" ON whatsapp_campaigns FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_campaigns_update" ON whatsapp_campaigns FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_campaigns_delete" ON whatsapp_campaigns FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== WHATSAPP_GROUPS ======
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_groups_select" ON whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_groups_insert" ON whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_groups_update" ON whatsapp_groups;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_groups_delete" ON whatsapp_groups;

CREATE POLICY "tenant_isolation_whatsapp_groups_select" ON whatsapp_groups FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_groups_insert" ON whatsapp_groups FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_groups_update" ON whatsapp_groups FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_groups_delete" ON whatsapp_groups FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== SORTEIOS ======
DROP POLICY IF EXISTS "tenant_isolation_sorteios_select" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_insert" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_update" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_delete" ON sorteios;

CREATE POLICY "tenant_isolation_sorteios_select" ON sorteios FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_insert" ON sorteios FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_update" ON sorteios FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_delete" ON sorteios FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== SORTEIO_PARTICIPANTES ======
DROP POLICY IF EXISTS "tenant_isolation_sorteio_participantes_select" ON sorteio_participantes;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_participantes_insert" ON sorteio_participantes;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_participantes_update" ON sorteio_participantes;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_participantes_delete" ON sorteio_participantes;

CREATE POLICY "tenant_isolation_sorteio_participantes_select" ON sorteio_participantes FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_participantes_insert" ON sorteio_participantes FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_participantes_update" ON sorteio_participantes FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_participantes_delete" ON sorteio_participantes FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ====== SORTEIO_GANHADORES ======
DROP POLICY IF EXISTS "tenant_isolation_sorteio_ganhadores_select" ON sorteio_ganhadores;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_ganhadores_insert" ON sorteio_ganhadores;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_ganhadores_update" ON sorteio_ganhadores;
DROP POLICY IF EXISTS "tenant_isolation_sorteio_ganhadores_delete" ON sorteio_ganhadores;

CREATE POLICY "tenant_isolation_sorteio_ganhadores_select" ON sorteio_ganhadores FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_ganhadores_insert" ON sorteio_ganhadores FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_ganhadores_update" ON sorteio_ganhadores FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteio_ganhadores_delete" ON sorteio_ganhadores FOR DELETE USING (tenant_id = get_user_tenant_id());

-- Adicione mais tabelas conforme necessário...

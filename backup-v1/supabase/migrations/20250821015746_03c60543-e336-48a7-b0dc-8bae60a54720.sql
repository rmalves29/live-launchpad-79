-- Remove old authentication-dependent RLS policies and create public access policies

-- Orders table - remove admin-only policy and allow public access
DROP POLICY IF EXISTS "Admins can manage orders" ON orders;
CREATE POLICY "Public can manage orders" ON orders FOR ALL USING (true) WITH CHECK (true);

-- Customers table - remove auth-dependent policies and allow public access  
DROP POLICY IF EXISTS "Role-based customer access" ON customers;
DROP POLICY IF EXISTS "Role-based customer updates" ON customers;
DROP POLICY IF EXISTS "Admins can delete customers" ON customers;

CREATE POLICY "Public can view customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Public can update customers" ON customers FOR UPDATE USING (true);
CREATE POLICY "Public can delete customers" ON customers FOR DELETE USING (true);

-- Profiles table - disable RLS since auth is removed
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- WhatsApp messages - allow public access
DROP POLICY IF EXISTS "Authenticated users can manage WhatsApp messages" ON whatsapp_messages;
CREATE POLICY "Public can manage whatsapp messages" ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- WhatsApp templates - allow public access for management
DROP POLICY IF EXISTS "Authenticated can manage templates" ON whatsapp_templates;
CREATE POLICY "Public can manage templates" ON whatsapp_templates FOR ALL USING (true) WITH CHECK (true);

-- Products - allow public management
DROP POLICY IF EXISTS "Authenticated users can manage products" ON products;
CREATE POLICY "Public can manage products" ON products FOR ALL USING (true) WITH CHECK (true);

-- Cart items - allow public access
DROP POLICY IF EXISTS "Users can view cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can manage cart items" ON cart_items;
CREATE POLICY "Public can manage cart items" ON cart_items FOR ALL USING (true) WITH CHECK (true);

-- Carts - allow public access
DROP POLICY IF EXISTS "Users can view their own carts" ON carts;
DROP POLICY IF EXISTS "Users can create their own carts" ON carts;  
DROP POLICY IF EXISTS "Users can update their own carts" ON carts;
CREATE POLICY "Public can manage carts" ON carts FOR ALL USING (true) WITH CHECK (true);

-- App settings - allow public management
DROP POLICY IF EXISTS "Authenticated can upsert app settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated can update app settings" ON app_settings;
CREATE POLICY "Public can manage app settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);
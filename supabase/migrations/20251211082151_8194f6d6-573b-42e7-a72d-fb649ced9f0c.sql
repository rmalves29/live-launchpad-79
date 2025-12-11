-- Enable RLS on tables that are missing it
ALTER TABLE phone_fix_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_fix_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for phone_fix_jobs
CREATE POLICY "Super admin can manage all phone_fix_jobs"
ON phone_fix_jobs FOR ALL
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their phone_fix_jobs"
ON phone_fix_jobs FOR ALL
USING (tenant_id = get_current_tenant_id());

-- Add RLS policies for phone_fix_changes
CREATE POLICY "Super admin can manage all phone_fix_changes"
ON phone_fix_changes FOR ALL
USING (is_super_admin());

CREATE POLICY "System can insert phone_fix_changes"
ON phone_fix_changes FOR INSERT
WITH CHECK (true);

-- Add RLS policies for scheduled_jobs
CREATE POLICY "Super admin can manage all scheduled_jobs"
ON scheduled_jobs FOR ALL
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their scheduled_jobs"
ON scheduled_jobs FOR ALL
USING (tenant_id = get_current_tenant_id());

-- Add RLS policies for scheduled_messages
CREATE POLICY "Super admin can manage all scheduled_messages"
ON scheduled_messages FOR ALL
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their scheduled_messages"
ON scheduled_messages FOR ALL
USING (tenant_id = get_current_tenant_id());

-- Add RLS policies for tenant_users
CREATE POLICY "Super admin can manage all tenant_users"
ON tenant_users FOR ALL
USING (is_super_admin());

CREATE POLICY "Users can view their own tenant_users"
ON tenant_users FOR SELECT
USING (user_id = auth.uid());

-- Fix the overly permissive orders policy
DROP POLICY IF EXISTS "Customers can view their own orders by phone" ON orders;
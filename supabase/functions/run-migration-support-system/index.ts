import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const results: string[] = [];

    // Test tables existence
    const tables = ['knowledge_base', 'support_settings', 'support_conversations', 'support_messages'];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code === '42P01') {
        results.push(`❌ ${table}: table does not exist - needs manual creation`);
      } else if (error) {
        results.push(`⚠️ ${table}: ${error.message}`);
      } else {
        results.push(`✅ ${table}: exists`);
      }
    }

    // Create storage bucket
    const { error: bucketError } = await supabase.storage.createBucket('knowledge-files', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/wav', 'audio/mp3',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ]
    });
    
    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        results.push("✅ knowledge-files bucket: exists");
      } else {
        results.push(`⚠️ knowledge-files bucket: ${bucketError.message}`);
      }
    } else {
      results.push("✅ knowledge-files bucket: created");
    }

    // Generate SQL for tables that need creation
    const sql = `
-- Run this SQL in Supabase SQL Editor if tables don't exist:

-- 1. Knowledge Base table
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'geral',
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  file_type TEXT CHECK (file_type IS NULL OR file_type IN ('text', 'document', 'image', 'video', 'audio')),
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage their knowledge base" ON knowledge_base FOR ALL
  USING (tenant_id = get_current_tenant_id() OR is_super_admin());

CREATE POLICY "Public can view active knowledge items" ON knowledge_base FOR SELECT
  USING (is_active = true);

-- 2. Support Settings table  
CREATE TABLE IF NOT EXISTS support_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  human_support_phone TEXT NOT NULL,
  max_attempts_before_escalation INTEGER DEFAULT 3,
  welcome_message TEXT DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudar?',
  escalation_message TEXT DEFAULT 'Estou transferindo para um atendente humano.',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE support_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage their support settings" ON support_settings FOR ALL
  USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 3. Support Conversations table
CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'active', 'escalated', 'resolved')),
  failed_attempts INTEGER DEFAULT 0,
  escalation_summary TEXT,
  escalated_at TIMESTAMPTZ,
  escalated_to_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage their conversations" ON support_conversations FOR ALL
  USING (tenant_id = get_current_tenant_id() OR is_super_admin());

CREATE POLICY "System can manage conversations" ON support_conversations FOR ALL
  USING (true);

-- 4. Support Messages table
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages from their conversations" ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_conversations sc
      WHERE sc.id = support_messages.conversation_id
      AND (sc.tenant_id = get_current_tenant_id() OR is_super_admin())
    )
  );

CREATE POLICY "System can manage messages" ON support_messages FOR ALL
  USING (true);

-- Storage policies
CREATE POLICY "Anyone can upload knowledge files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-files');

CREATE POLICY "Anyone can view knowledge files" ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-files');

CREATE POLICY "Anyone can delete knowledge files" ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-files');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant ON knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_active ON knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_support_conversations_tenant ON support_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id);
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        sql_to_run: sql
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Migration error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

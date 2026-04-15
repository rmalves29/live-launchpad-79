import type { Database } from '@/integrations/supabase/types';
import { getBrasiliaDateTimeISO } from '@/lib/date-utils';
import { supabaseTenant } from '@/lib/supabase-tenant';

export type WhatsAppTemplateType = Database['public']['Enums']['whatsapp_template_type'];
type WhatsAppTemplateRow = Database['public']['Tables']['whatsapp_templates']['Row'];

type SaveWhatsAppTemplateInput = {
  content: string;
  editingId?: number | null;
  originalType?: WhatsAppTemplateType;
  tenantId?: string;
  title?: string | null;
  type: WhatsAppTemplateType;
};

const getTenantTemplateContext = (explicitTenantId?: string) => {
  const tenantId = explicitTenantId || supabaseTenant.getTenantId();

  if (!tenantId) {
    throw new Error('Tenant ID não encontrado.');
  }

  return {
    tenantId,
    table: supabaseTenant.raw.from('whatsapp_templates'),
  };
};

export async function getLatestWhatsAppTemplate(type: WhatsAppTemplateType) {
  const { tenantId, table } = getTenantTemplateContext();

  const { data, error } = await table
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('type', type)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listLatestWhatsAppTemplates() {
  const { tenantId, table } = getTenantTemplateContext();

  const { data, error } = await table
    .select('*')
    .eq('tenant_id', tenantId)
    .order('type', { ascending: true })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const latestByType = new Map<WhatsAppTemplateType, WhatsAppTemplateRow>();

  for (const template of data ?? []) {
    if (!latestByType.has(template.type)) {
      latestByType.set(template.type, template);
    }
  }

  return Array.from(latestByType.values());
}

export async function saveWhatsAppTemplate({
  content,
  editingId,
  originalType,
  title,
  type,
}: SaveWhatsAppTemplateInput) {
  const { tenantId, table } = getTenantTemplateContext();
  const updatedAt = getBrasiliaDateTimeISO();
  let keptId = editingId ?? null;

  if (editingId) {
    const { error: updateError } = await table
      .update({ content, title: title ?? null, type, updated_at: updatedAt })
      .eq('tenant_id', tenantId)
      .eq('id', editingId);

    if (updateError) throw updateError;
  } else {
    const { data: existingTemplates, error: existingError } = await table
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });

    if (existingError) throw existingError;

    if (existingTemplates && existingTemplates.length > 0) {
      keptId = existingTemplates[0].id;

      const { error: updateError } = await table
        .update({ content, title: title ?? null, updated_at: updatedAt })
        .eq('tenant_id', tenantId)
        .eq('id', keptId);

      if (updateError) throw updateError;
    } else {
      const { data: insertedTemplate, error: insertError } = await table
        .insert({
          content,
          tenant_id: tenantId,
          title: title ?? null,
          type,
          updated_at: updatedAt,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      keptId = insertedTemplate.id;
    }
  }

  if (!keptId) {
    throw new Error('Não foi possível identificar o template salvo.');
  }

  const { data: sameTypeTemplates, error: sameTypeError } = await table
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', type);

  if (sameTypeError) throw sameTypeError;

  const duplicateIds = (sameTypeTemplates ?? [])
    .map((template) => template.id)
    .filter((id) => id !== keptId);

  if (duplicateIds.length > 0) {
    const { error: deleteDuplicatesError } = await table
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', duplicateIds);

    if (deleteDuplicatesError) throw deleteDuplicatesError;
  }

  if (originalType && originalType !== type) {
    const { error: deleteOldTypeError } = await table
      .delete()
      .eq('tenant_id', tenantId)
      .eq('type', originalType);

    if (deleteOldTypeError) throw deleteOldTypeError;
  }

  return keptId;
}

export async function deleteWhatsAppTemplate(type: WhatsAppTemplateType) {
  const { tenantId, table } = getTenantTemplateContext();

  const { error } = await table
    .delete()
    .eq('tenant_id', tenantId)
    .eq('type', type);

  if (error) throw error;
}
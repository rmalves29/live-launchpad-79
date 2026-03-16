import { supabase } from '@/integrations/supabase/client';

export interface FlowGroupEvent {
  id: string;
  group_id: string | null;
  group_jid: string | null;
  phone: string | null;
  event_type: string;
  created_at: string;
}

export interface FlowGroupReference {
  id: string;
  group_jid: string;
}

const PAGE_SIZE = 1000;

export async function fetchAllTenantGroupEvents(tenantId: string, since?: string) {
  const events: FlowGroupEvent[] = [];
  let from = 0;

  while (true) {
    let query: any = supabase
      .from('fe_group_events' as any)
      .select('id, group_id, group_jid, phone, event_type, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = ((data || []) as FlowGroupEvent[]);
    events.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return events;
}

export function summarizeFlowEvents(events: FlowGroupEvent[], groups?: FlowGroupReference[]) {
  if (!groups) {
    return events.reduce(
      (acc, event) => {
        if (event.event_type === 'join') acc.entries += 1;
        if (event.event_type === 'leave') acc.exits += 1;
        return acc;
      },
      { entries: 0, exits: 0, filteredEvents: events },
    );
  }

  if (groups.length === 0) {
    return { entries: 0, exits: 0, filteredEvents: [] as FlowGroupEvent[] };
  }

  const groupIds = new Set(groups.map((group) => group.id));
  const groupJids = new Set(groups.map((group) => group.group_jid));
  const filteredEvents = events.filter((event) => {
    const matchesId = !!event.group_id && groupIds.has(event.group_id);
    const matchesJid = !!event.group_jid && groupJids.has(event.group_jid);
    return matchesId || matchesJid;
  });

  return filteredEvents.reduce(
    (acc, event) => {
      if (event.event_type === 'join') acc.entries += 1;
      if (event.event_type === 'leave') acc.exits += 1;
      return acc;
    },
    { entries: 0, exits: 0, filteredEvents },
  );
}

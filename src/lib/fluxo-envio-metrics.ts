import { supabase } from '@/integrations/supabase/client';

export interface FlowGroupEvent {
  id: string;
  group_id: string | null;
  group_jid: string | null;
  phone: string | null;
  event_type: string;
  created_at: string;
  campaign_id: string | null;
  click_id: string | null;
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
      .select('id, group_id, group_jid, phone, event_type, created_at, campaign_id, click_id')
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

/** Campaign metrics follow attributed events, never current group membership. */
export function summarizeFlowEvents(allEvents: FlowGroupEvent[], campaignId?: string, since?: string) {
  const sinceMs = since ? new Date(since).getTime() : Number.NEGATIVE_INFINITY;
  const events = since ? allEvents.filter((event) => new Date(event.created_at).getTime() >= sinceMs) : allEvents;
  if (campaignId === undefined) {
    return events.reduce(
      (acc, event) => {
        if (event.event_type === 'join') acc.entries += 1;
        if (event.event_type === 'leave') acc.exits += 1;
        return acc;
      },
      { entries: 0, exits: 0, filteredEvents: events },
    );
  }

  const filteredEvents = events.filter((event) => event.campaign_id === campaignId);

  return filteredEvents.reduce(
    (acc, event) => {
      if (event.event_type === 'join') acc.entries += 1;
      if (event.event_type === 'leave') acc.exits += 1;
      return acc;
    },
    { entries: 0, exits: 0, filteredEvents },
  );
}

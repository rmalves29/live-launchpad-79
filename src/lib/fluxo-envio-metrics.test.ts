import { describe, expect, mock, test } from 'bun:test';

mock.module('@/integrations/supabase/client', () => ({ supabase: {} }));
const { summarizeFlowEvents } = await import('./fluxo-envio-metrics');
import type { FlowGroupEvent } from './fluxo-envio-metrics';

const event = (id: string, campaign_id: string | null, event_type = 'join'): FlowGroupEvent => ({
  id, campaign_id, event_type, click_id: null, group_id: 'shared-group',
  group_jid: 'shared-group@g.us', phone: '5511999999999', created_at: '2026-10-29T14:00:00-03:00',
});

describe('Campaign attribution metrics', () => {
  test('Shared groups do not duplicate entries between campaigns', () => {
    const events = [event('1', 'a'), event('2', 'b'), event('3', null)];
    expect(summarizeFlowEvents(events, 'a').entries).toBe(1);
    expect(summarizeFlowEvents(events, 'b').entries).toBe(1);
  });
  test('Exits belong only to the attributed campaign', () => {
    const events = [event('1', 'a', 'leave'), event('2', 'b', 'leave'), event('3', null, 'leave')];
    expect(summarizeFlowEvents(events, 'a').exits).toBe(1);
    expect(summarizeFlowEvents(events, 'missing').exits).toBe(0);
  });
  test('Tenant totals retain joins without a campaign', () => {
    const events = [event('1', 'a'), event('2', null)];
    expect(summarizeFlowEvents(events).entries).toBe(2);
    expect(summarizeFlowEvents(events, 'a').entries).toBe(1);
  });
});
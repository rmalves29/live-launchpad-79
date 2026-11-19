// Substitui src/integrations/supabase/client nos testes do front.
export const supabase = new Proxy({}, {
  get(_target, key) {
    if (!globalThis.__fakeSupabase) throw new Error('[tests] o código do front tentou usar o Supabase sem banco falso');
    return globalThis.__fakeSupabase[key];
  },
});

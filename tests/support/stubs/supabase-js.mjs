// Substitui o cliente do Supabase nas edge functions pelo banco falso do teste atual.
export function createClient() {
  if (!globalThis.__fakeSupabase) throw new Error('[tests] defina o banco falso antes de carregar a função');
  return globalThis.__fakeSupabase;
}

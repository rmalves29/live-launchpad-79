import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleFreteBaratoSettings } from '../_shared/fretebarato-settings-handler.ts';

Deno.serve((req) => handleFreteBaratoSettings(req, createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)));

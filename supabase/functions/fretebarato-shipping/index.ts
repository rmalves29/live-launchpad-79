import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleFreteBaratoQuote } from '../_shared/fretebarato-quote-handler.ts';

Deno.serve((req) => handleFreteBaratoQuote(req, createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)));

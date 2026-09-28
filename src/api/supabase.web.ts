import { createClient } from '@supabase/supabase-js';
import { obterConfigSupabase } from '@/config/env';
import { armazenamentoSessao } from '@/services/cofre/armazenamentoSessao';

const { url, chaveAnon } = obterConfigSupabase();

/** Cliente Supabase específico do browser. */
export const supabase = createClient(url, chaveAnon, {
  auth: {
    storage: armazenamentoSessao,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

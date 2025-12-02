import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validação
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("As variáveis de ambiente do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) não foram encontradas. Verifique seu arquivo .env.local (para desenvolvimento) ou as configurações de ambiente no seu provedor de hospedagem (para produção).");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persiste a sessão apenas enquanto o navegador estiver aberto
    persistSession: true,
    
    autoRefreshToken: true,
    
    detectSessionInUrl: true,

    storage: window.sessionStorage,
    
    storageKey: 'supabase.auth.token'
  }
});

export const SUPABASE_BUCKET_NAME = "quest-images";

export { SUPABASE_URL, SUPABASE_ANON_KEY };
import { createClient } from '@supabase/supabase-js';

// Lê as variáveis de ambiente
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validação apenas para desenvolvimento
if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error('⚠️ Variáveis de ambiente faltando:', {
    VITE_SUPABASE_URL: SUPABASE_URL ? '✓' : '✗',
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? '✓' : '✗'
  });
  throw new Error(
    "As variáveis de ambiente do Supabase não foram encontradas. " +
    "Crie um arquivo .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SUPABASE_BUCKET_NAME = "quest-images";

export { SUPABASE_URL, SUPABASE_ANON_KEY };
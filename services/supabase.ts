import { createClient } from '@supabase/supabase-js';

// A maneira correta e padrão do Vite de ler variáveis de ambiente.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validação
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("As variáveis de ambiente do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) não foram encontradas. Verifique seu arquivo .env.local (para desenvolvimento) ou as configurações de ambiente no seu provedor de hospedagem (para produção).");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SUPABASE_BUCKET_NAME = "quest-images";

export { SUPABASE_URL, SUPABASE_ANON_KEY };
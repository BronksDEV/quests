import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("As variáveis de ambiente do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) não foram encontradas.");
}

// Classe de Storage Híbrido (Resistente a suspensão de aba e refresh)
class HybridStorage {
  private prefix = 'supabase.auth.token';

  getItem(key: string): string | null {
    // 1. Tenta sessionStorage (Memória rápida da aba)
    let item = window.sessionStorage.getItem(key);
    
    // 2. Se falhar, busca no localStorage (Disco, persiste a crash/refresh)
    if (!item) {
      item = window.localStorage.getItem(this.prefix);
    }
    
    return item;
  }

  setItem(key: string, value: string): void {
    // Salva em ambos para redundância
    window.sessionStorage.setItem(key, value);
    window.localStorage.setItem(this.prefix, value);
  }

  removeItem(key: string): void {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(this.prefix);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: new HybridStorage(), // Uso do storage customizado
    storageKey: 'sb-auth-token'
  }
});

export const SUPABASE_BUCKET_NAME = "quest-images";

// Renovação preventiva periódica (Backup do Heartbeat)
setInterval(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await supabase.auth.refreshSession();
  }
}, 45 * 60 * 1000); 

export { SUPABASE_URL, SUPABASE_ANON_KEY };
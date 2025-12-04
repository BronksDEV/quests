import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("As variáveis de ambiente do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) não foram encontradas.");
}

class HybridStorage {
  private prefix = 'supabase.auth.token';

  getItem(key: string): string | null {
    let item = window.sessionStorage.getItem(key);
    
    if (!item) {
      item = window.localStorage.getItem(this.prefix);
    }
    
    return item;
  }

  setItem(key: string, value: string): void {
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
    storage: new HybridStorage(), 
    storageKey: 'sb-auth-token'
  }
});

export const SUPABASE_BUCKET_NAME = "quest-images";

setInterval(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await supabase.auth.refreshSession();
  }
}, 45 * 60 * 1000); 

export { SUPABASE_URL, SUPABASE_ANON_KEY };
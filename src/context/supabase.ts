import { createClient } from '@supabase/supabase-js';

const rawEnableSupabaseAuth = String(import.meta.env.VITE_ENABLE_SUPABASE_AUTH || '').trim().toLowerCase();
const enableSupabaseAuth =
  rawEnableSupabaseAuth === 'true' || rawEnableSupabaseAuth === '1' || rawEnableSupabaseAuth === 'yes';

const configuredSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const configuredSupabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const missingSupabaseConfig = !configuredSupabaseUrl || !configuredSupabaseAnonKey;
if (enableSupabaseAuth && missingSupabaseConfig) {
  throw new Error('Supabase auth is enabled, but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.');
}

// App imports `supabase` even when Supabase auth is disabled. Keep a safe placeholder client in that case.
const supabaseUrl = missingSupabaseConfig ? 'http://localhost:54321' : configuredSupabaseUrl;
const supabaseAnonKey = missingSupabaseConfig ? 'invalid-anon-key' : configuredSupabaseAnonKey;
const authStorageKey = 'ventra_supabase_auth';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: authStorageKey,
  },
});

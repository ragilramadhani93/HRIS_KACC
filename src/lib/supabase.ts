/**
 * KACC HRIS database client.
 *
 * When Supabase credentials are configured (VITE_SUPABASE_URL +
 * VITE_SUPABASE_ANON_KEY, paste them in the project's Keys / API keys tab),
 * this connects to your hosted Supabase project so every device shares the
 * same data: admin web app + employee Android APK (face recognition login,
 * attendance, leave, payslips).
 *
 * While credentials are missing it falls back to the built-in browser-local
 * demo database (./localDb.ts) so the app still works for preview/testing.
 *
 * Required setup:
 *   1. Create a Supabase project, then run every file in supabase/migrations/
 *      (in order) in the SQL editor — this creates all tables, RLS policies
 *      and storage buckets used by the app.
 *   2. Paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY into Keys.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LocalDatabase } from './localDb';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Typed as the real Supabase client: the app only uses the standard
// supabase-js API surface (from().select chains, auth, storage, channel).
// The local demo database implements the same surface, so it satisfies the
// type only via a cast (it is never used when credentials are configured).
export const supabase: SupabaseClient<any, 'public', any> =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : (new LocalDatabase() as unknown as SupabaseClient<any, 'public', any>);

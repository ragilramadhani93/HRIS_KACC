/**
 * KACC HRIS database client.
 *
 * Uses hosted Supabase for shared data across web admin + Android APK.
 * Credentials are read from VITE env vars at build time; when those are
 * unavailable the hardcoded production values are used as fallback.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LocalDatabase } from './localDb';

// Production Supabase project credentials
const PROD_SUPABASE_URL = 'https://ujtzsuqzpuplebfyqvmd.supabase.co';
const PROD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqdHpzdXF6cHVwbGViZnlxdm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTk4NjIsImV4cCI6MjEwMjI3NTg2Mn0.WgcFdKSUeIZ7Genm14KIYt3XahAFX_G606EQbDBNZAo';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PROD_SUPABASE_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PROD_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient<any, 'public', any> =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : (new LocalDatabase() as unknown as SupabaseClient<any, 'public', any>);

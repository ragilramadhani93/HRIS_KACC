/**
 * KACC HRIS database client.
 *
 * The app previously depended on Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 * It now uses a built-in, browser-local database (see ./localDb.ts) that exposes
 * the same API surface — queries, joins, mutations, auth, storage, realtime —
 * with zero environment variables and no external service.
 */
import { LocalDatabase } from './localDb';

export const supabase = new LocalDatabase();

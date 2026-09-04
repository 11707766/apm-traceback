/* Paste your Supabase project values here.
   Dashboard -> Project Settings -> API -> Project URL + anon public key.
   Both are safe in client code; access is enforced by row level security. */
export const SUPABASE_URL = "REPLACE_WITH_PROJECT_URL";
export const SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_PUBLIC_KEY";

export const isConfigured = !SUPABASE_URL.startsWith("REPLACE");

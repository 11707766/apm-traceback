/* Supabase project values.
   Dashboard -> Project Settings -> API Keys. Both are safe in client code;
   access is enforced by row level security. */
export const SUPABASE_URL = "https://vmutkqvzsgkxzsbejxwu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_1FFpCCaRPZK0NnwyDMF7Jg_-pM1EHK2";

export const isConfigured = !SUPABASE_URL.startsWith("REPLACE");

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_PUBLISHABLE_KEY__: string;

// Replaced by electron-vite at build time; runtime IPC cannot change the project.
export const supabaseUrl = __SUPABASE_URL__;
export const supabasePublishableKey = __SUPABASE_PUBLISHABLE_KEY__;

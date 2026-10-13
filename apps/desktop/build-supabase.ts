export function resolveSupabaseBuildConfig(env: Record<string, string | undefined>) {
  const url = env['SUPABASE_URL']?.trim() ?? '';
  const publishableKey = env['SUPABASE_PUBLISHABLE_KEY']?.trim() ?? '';
  if (!url && !publishableKey && env['SUPABASE_REQUIRE_CONFIG'] !== '1') return { url: '', publishableKey: '' };
  if (!url || !publishableKey) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before building Hopdock.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a public sb_publishable_ key.');
  }
  return { url: parsed.origin, publishableKey };
}

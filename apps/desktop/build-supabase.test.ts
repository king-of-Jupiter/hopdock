import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSupabaseBuildConfig } from './build-supabase';

const env = { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
test('normalizes public build configuration; supports an offline development build', () => {
  assert.equal(resolveSupabaseBuildConfig(env).url, 'https://example.supabase.co');
  assert.deepEqual(resolveSupabaseBuildConfig({}), { url: '', publishableKey: '' });
});
test('rejects incomplete release config, credentials in URLs and privileged keys', () => {
  assert.throws(() => resolveSupabaseBuildConfig({ SUPABASE_REQUIRE_CONFIG: '1' }), /Set SUPABASE/);
  assert.throws(() => resolveSupabaseBuildConfig({ SUPABASE_URL: env.SUPABASE_URL }), /Set SUPABASE/);
  for (const url of ['http://example.supabase.co', 'https://user:password@example.supabase.co', 'https://example.supabase.co/rest/v1', 'https://example.supabase.co?key=secret']) {
    assert.throws(() => resolveSupabaseBuildConfig({ ...env, SUPABASE_URL: url }), /HTTPS project origin/);
  }
  assert.throws(() => resolveSupabaseBuildConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_bundle' }), /public sb_publishable_/);
});

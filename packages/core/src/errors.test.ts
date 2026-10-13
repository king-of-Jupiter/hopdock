import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainError } from './errors';

const examples: [unknown, string][] = [
  ["ENOENT: no such file or directory, open 'resources/app-update.yml'", 'UPDATE_CONFIG'],
  ['Error: Error invoking remote method winscp:open: Error: private key file missing on this device', 'KEY_MISSING'],
  ['Private key is not available on this device. Sync your vault first.', 'KEY_MISSING'],
  ['referenced key not found', 'KEY_NOT_FOUND'], ['no stored password for this host', 'PASSWORD_MISSING'],
  ['Unable to import private key: Encrypted private OpenSSH key detected, but no passphrase given', 'KEY_PASSPHRASE'],
  ['Unable to import private key: Unsupported key format', 'KEY_INVALID'],
  ['WinSCP was not found.', 'WINSCP_MISSING'], ['Choose the WinSCP.exe application.', 'WINSCP_PATH'],
  ['All configured authentication methods failed', 'AUTH_FAILED'], [{ code: 'ECONNREFUSED' }, 'CONNECTION_REFUSED'],
  [{ code: 'ENOTFOUND' }, 'DNS_FAILED'], ['SSH ready timeout', 'TIMEOUT'], [{ code: 'ECONNRESET' }, 'CONNECTION_LOST'],
  [{ code: 'ENETUNREACH' }, 'NETWORK'], [{ code: 'EACCES' }, 'ACCESS_DENIED'], [{ code: 'ENOENT' }, 'FILE_MISSING'],
  [{ code: 'ENOSPC' }, 'STORAGE_FULL'], [{ code: 'EEXIST' }, 'FILE_EXISTS'], [{ code: 'EBUSY' }, 'FILE_BUSY'],
  ['Source and destination are the same file.', 'SAME_FILE'], ['Sync is in progress.', 'OPERATION_BUSY'],
  ['Cannot decrypt synced vault data.', 'SYNC_DECRYPT'], ['Set a sync encryption password in Settings first.', 'SYNC_PASSWORD'],
  ['Sign in to sync in Settings first.', 'SYNC_ACCOUNT'], ['This build has no Supabase configuration.', 'SYNC_BUILD'],
  [{ code: 'PGRST205' }, 'SYNC_DATABASE'], ['Invalid login credentials', 'SYNC_LOGIN'], [{ code: '42501' }, 'SYNC_ACCESS'],
  ['Invalid synced key material.', 'SYNC_DATA'], ['Update checks are available in installed release builds.', 'UPDATE_DEV'],
  [{ status: 429 }, 'RATE_LIMIT'], [{ status: 503 }, 'SERVICE_DOWN'],
];
test('known failures have specific titles, recovery hints and safe error codes', () => {
  for (const [error, code] of examples) { const issue = explainError(error, 'test'); assert.equal(issue.code, code, JSON.stringify(error)); assert.ok(issue.title && issue.message && issue.hint); assert.ok(!issue.message.includes('invoking remote method')); }
});
test('IPC envelope survives Error serialization without exposing original credentials', () => {
  const issue = explainError('private key file missing on this device', 'winscp:open');
  assert.deepEqual(explainError(new Error('HOPDOCK_ERROR:' + JSON.stringify(issue))), issue);
  const unknown = explainError(new Error('Unexpected transport data password=secret user:secret@example.test PRIVATE KEY 503404'));
  assert.equal(unknown.code, 'UNEXPECTED'); assert.ok(!JSON.stringify(unknown).includes('secret'));
});
test('SFTP protocol codes, HTTP status and malformed IPC envelopes get safe fallbacks', () => {
  assert.equal(explainError({ code: 2 }, 'sftp:list').code, 'FILE_MISSING');
  assert.equal(explainError({ code: 3 }, 'sftp:uploadFrom').code, 'ACCESS_DENIED');
  assert.equal(explainError({ code: 8 }, 'sftp:chmod').code, 'SFTP_UNSUPPORTED');
  assert.equal(explainError({ code: 4 }, 'sftp:remove').code, 'SFTP_FAILED');
  assert.equal(explainError({ status: 401 }, 'sync:now').code, 'SYNC_LOGIN');
  assert.equal(explainError({ status: 403 }, 'sync:now').code, 'SYNC_ACCESS');
  assert.equal(explainError('HOPDOCK_ERROR:bad-json').code, 'UNEXPECTED');
});

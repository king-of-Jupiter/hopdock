import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRemoteOs, parseOsRelease, parseOsBanner } from './detect-os';
const fake = (responses: Record<string, string>) => async (command: string) => ({ stdout: responses[command] ?? '', stderr: '', code: command in responses ? 0 : 1 });
test('os-release identity overrides marketing text and preserves distro family/version', () => {
  const os = parseOsRelease('ID=rocky\nID_LIKE="rhel centos fedora"\nPRETTY_NAME="Rocky Linux 9"\nVERSION_ID="9"');
  assert.equal(os?.id, 'rocky'); assert.equal(os?.family, 'rhel centos fedora'); assert.equal(os?.name, 'Rocky Linux 9');
  assert.equal(parseOsRelease('some echo or banner'), null);
});
test('Linux probing uses commands compatible with fish and never changes shell history/exits', async () => {
  const commands: string[] = [];
  const os = await detectRemoteOs(async (command) => { commands.push(command); return fake({ 'uname -s': 'Linux\n', 'cat /etc/os-release': 'ID=debian\nPRETTY_NAME="Debian 13"' })(command); });
  assert.equal(os?.id, 'debian'); assert.deepEqual(commands, ['uname -s', 'cat /etc/os-release']);
});
test('detects macOS, BSD, Windows and RouterOS and keeps unknown servers unknown', async () => {
  assert.equal((await detectRemoteOs(fake({ 'uname -s': 'Darwin', 'sw_vers -productVersion': '15.1' })))?.id, 'macos');
  assert.equal((await detectRemoteOs(fake({ 'uname -s': 'FreeBSD' })))?.id, 'freebsd');
  assert.equal((await detectRemoteOs(fake({ 'cmd /c ver': 'Microsoft Windows [Version 10.0.20348.1]' })))?.id, 'windows');
  assert.equal((await detectRemoteOs(fake({ ':put [/system resource get platform]': 'MikroTik' })))?.id, 'routeros');
  assert.equal(await detectRemoteOs(fake({})), null);
});
test('denied probes fall back to a labeled banner hint; unknown banners cannot invent an OS', async () => {
  assert.equal((await detectRemoteOs(async () => { throw new Error('denied'); }, 'Welcome to Ubuntu 24.04'))?.source, 'banner');
  assert.equal(parseOsBanner('OpenSSH_9.2 Welcome to our server'), null);
});

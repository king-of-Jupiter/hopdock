/** A window opened from a tab carries `#window=w<n>&host=<id>`; its sessions are prefixed so they never collide with another window's. */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.hash.slice(1));
const scope = params.get('window');

export const windowScope = scope && /^w\d{1,6}$/.test(scope) ? scope : undefined;
export const launchHostId = windowScope ? params.get('host') : null;

/** `instance` numbers extra tabs to the same host (2, 3, …); the first tab keeps the plain host id. */
export function terminalSessionId(hostId: string, instance = 1): string {
  const base = windowScope ? `${windowScope}:${hostId}` : hostId;
  return instance > 1 ? `${base}#${instance}` : base;
}

export function sftpSessionId(hostId: string): string {
  return windowScope ? `${windowScope}:sftp:${hostId}` : `sftp:${hostId}`;
}

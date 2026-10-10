import type { Host } from '@hopdock/core';

export interface OsTile {
  color: string;
  glyph: string;
  label: string;
}

const TABLE: Array<{ match: RegExp; color: string; glyph: string; label: string }> = [
  { match: /ubuntu/i, color: '#E95420', glyph: 'U', label: 'Ubuntu' },
  { match: /debian/i, color: '#D70A53', glyph: 'D', label: 'Debian' },
  { match: /arch|manjaro|endeavour/i, color: '#1793D1', glyph: 'A', label: 'Arch' },
  { match: /alpine/i, color: '#0D597F', glyph: 'a', label: 'Alpine' },
  { match: /fedora/i, color: '#51A2DA', glyph: 'F', label: 'Fedora' },
  { match: /centos|almalinux|rocky|rhel|redhat/i, color: '#932279', glyph: 'C', label: 'RHEL' },
  { match: /suse|opensuse/i, color: '#73BA25', glyph: 'S', label: 'openSUSE' },
  { match: /gentoo/i, color: '#54487A', glyph: 'G', label: 'Gentoo' },
  { match: /nixos/i, color: '#7EBDC2', glyph: 'N', label: 'NixOS' },
  { match: /freebsd|openbsd|netbsd/i, color: '#AB2B28', glyph: 'B', label: 'BSD' },
  { match: /windows|win-|wsl/i, color: '#00A4EF', glyph: 'W', label: 'Windows' },
  { match: /macos|darwin|mac-/i, color: '#6E6E73', glyph: '', label: 'macOS' },
  { match: /pi|raspberry|raspbian/i, color: '#C51A4A', glyph: 'π', label: 'Raspberry Pi' },
  { match: /router|mikrotik|openwrt/i, color: '#5B5BD6', glyph: 'R', label: 'Router' },
  { match: /docker|container/i, color: '#2496ED', glyph: '◈', label: 'Container' },
  { match: /db|postgres|mysql|mongo|redis/i, color: '#336791', glyph: 'D', label: 'Database' },
  { match: /k8s|kube|k3s/i, color: '#326CE5', glyph: 'K', label: 'Kubernetes' },
];

export function osTile(host: Host): OsTile {
  const hay = `${host.name} ${host.tags.join(' ')}`;
  for (const row of TABLE) {
    if (row.match.test(hay)) return { color: row.color, glyph: row.glyph, label: row.label };
  }
  return { color: '#3B4252', glyph: '›_', label: 'SSH' };
}

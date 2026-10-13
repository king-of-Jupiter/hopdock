import { siUbuntu, siDebian, siArchlinux, siDocker, siKubernetes, siRaspberrypi, siFedora, siAlpinelinux, siApple, siPostgresql, siNixos, siGentoo, siOpensuse } from 'simple-icons';
import type { Host } from '@hopdock/core';
import { osTile } from './os';
import { Icons } from './icons';
import { siLinux, siFreebsd, siMikrotik, siOpenwrt, siRedhat, siCentos, siRockylinux, siAlmalinux, siLinuxmint } from 'simple-icons';
import { IconBrandWindows } from '@tabler/icons-react';
const icons: Record<string, { svg: string }> = { Ubuntu: siUbuntu, Debian: siDebian, Arch: siArchlinux, Container: siDocker, Kubernetes: siKubernetes, 'Raspberry Pi': siRaspberrypi, Fedora: siFedora, Alpine: siAlpinelinux, macOS: siApple, Database: siPostgresql, NixOS: siNixos, Gentoo: siGentoo, openSUSE: siOpensuse };
export function OsIcon({ host, small = false }: { host: Host; small?: boolean }) {
  const tile = osTile(host);
  const source = icons[tile.label] ?? ({ Linux: siLinux, BSD: siFreebsd, RouterOS: siMikrotik, OpenWrt: siOpenwrt, RHEL: siRedhat, CentOS: siCentos, 'Rocky Linux': siRockylinux, AlmaLinux: siAlmalinux, 'Linux Mint': siLinuxmint } as Record<string, { svg: string }>)[tile.label];
  return <span className={'hd-tile' + (small ? ' sm' : '')} style={{ background: tile.color }} title={host.os?.name ?? tile.label} data-os={host.os?.id}>
    {source ? <img alt="" src={`data:image/svg+xml,${encodeURIComponent(source.svg.replace('<svg ', '<svg fill="white" '))}`} /> : tile.label === 'Windows' ? <IconBrandWindows size={small ? 16 : 24} stroke={1.6} /> : <Icons.terminal />}
  </span>;
}

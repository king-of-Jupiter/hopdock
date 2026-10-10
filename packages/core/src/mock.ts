import type { Host, HostGroup, KeyRef, Snippet, Vault } from './models';

export const mockVaults: Vault[] = [
  { id: 'v-personal', name: 'My Vault', personal: true, updatedAt: '2026-10-01T10:00:00Z' },
  { id: 'v-shared', name: 'Friends', personal: false, updatedAt: '2026-10-02T10:00:00Z' },
];

export const mockGroups: HostGroup[] = [
  { id: 'g-prod', vaultId: 'v-personal', name: 'Production', sort: 1 },
  { id: 'g-staging', vaultId: 'v-personal', name: 'Staging', sort: 2 },
  { id: 'g-dev', vaultId: 'v-personal', name: 'Development', sort: 3 },
  { id: 'g-homelab', vaultId: 'v-shared', name: 'Homelab', sort: 4 },
];

const h = (
  id: string,
  groupId: string,
  name: string,
  username: string,
  host: string,
  extra: Partial<Host> = {},
): Host => ({
  id,
  vaultId: 'v-personal',
  groupId,
  name,
  host,
  port: 22,
  username,
  auth: { type: 'key', keyId: 'k-ed' },
  portForwards: [],
  tags: [],
  remark: '',
  sort: 0,
  starred: false,
  updatedAt: '2026-10-01T10:00:00Z',
  ...extra,
});

export const mockHosts: Host[] = [
  h('web-01', 'g-prod', 'web-01', 'root', '3.12.44.10', { latencyMs: 24, tags: ['nginx'] }),
  h('web-02', 'g-prod', 'web-02', 'root', '3.12.44.11', { latencyMs: 22, starred: true, tags: ['nginx', 'prod'] }),
  h('db-01', 'g-prod', 'db-01', 'ubuntu', '10.0.1.5', { latencyMs: 31, tags: ['postgres'] }),
  h('staging-app', 'g-staging', 'staging-app', 'ubuntu', '18.213.24.7', { latencyMs: 48 }),
  h('staging-db', 'g-staging', 'staging-db', 'ubuntu', '18.213.24.8', { latencyMs: 51 }),
  h('dev-box', 'g-dev', 'dev-box', 'alex', '192.168.1.22', { latencyMs: 3 }),
  h('k8s-node', 'g-dev', 'k8s-node', 'alex', '10.10.0.3', { latencyMs: 6, tags: ['k3s'] }),
  h('ci-runner', 'g-dev', 'ci-runner', 'gitlab', '10.10.0.5', { latencyMs: 7 }),
  h('monitoring', 'g-dev', 'monitoring', 'alex', '10.10.0.9', { latencyMs: 5, tags: ['grafana'] }),
  h('home-lab', 'g-homelab', 'home-lab', 'pi', '192.168.0.10', { latencyMs: 2, vaultId: 'v-shared', tags: ['pi'] }),
  h('nas', 'g-homelab', 'nas', 'admin', '192.168.0.20', {
    vaultId: 'v-shared',
    latencyMs: 2,
    auth: { type: 'password', passwordRef: 'kc-nas' },
  }),
  h('vps-fi', 'g-prod', 'vps-fi', 'root', '95.216.10.4', { latencyMs: 41, tags: ['backup'] }),
];

export const mockKeys: KeyRef[] = [
  {
    id: 'k-ed',
    vaultId: 'v-personal',
    name: 'id_ed25519',
    kind: 'Ed25519',
    fingerprint: 'SHA256:mQ3vKp9xF2nL8sDf...',
    publicKey: 'ssh-ed25519 AAAA... alex@hopdock',
    privateRef: 'kc-ed',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'k-rsa',
    vaultId: 'v-shared',
    name: 'id_rsa (legacy)',
    kind: 'RSA',
    fingerprint: 'SHA256:7HbT2wQz...',
    publicKey: 'ssh-rsa AAAA... friends@hopdock',
    privateRef: 'kc-rsa',
    updatedAt: '2026-09-02T10:00:00Z',
  },
];

export const mockSnippets: Snippet[] = [
  {
    id: 's-sysinfo',
    vaultId: 'v-personal',
    folder: 'diagnostics',
    name: 'sysinfo',
    script: 'uname -a && uptime && df -h /',
    vars: [],
    updatedAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 's-dclean',
    vaultId: 'v-personal',
    folder: 'docker',
    name: 'docker cleanup',
    script: 'docker system prune -af --volumes --filter "until=${hours}h"',
    vars: ['hours'],
    updatedAt: '2026-09-11T10:00:00Z',
  },
  {
    id: 's-backup',
    vaultId: 'v-shared',
    folder: 'backup',
    name: 'pg backup',
    script: 'pg_dump -U ${user} ${db} | gzip > /backups/${db}-$(date +%F).sql.gz',
    vars: ['user', 'db'],
    updatedAt: '2026-09-12T10:00:00Z',
  },
];

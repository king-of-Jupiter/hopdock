export type Id = string;

export interface Vault {
  id: Id;
  name: string;
  personal: boolean;
  updatedAt: string;
}

export interface HostGroup {
  id: Id;
  vaultId: Id;
  name: string;
  sort: number;
  updatedAt?: string;
}

export type AuthType = 'password' | 'key' | 'key-password' | 'agent' | 'cert';

export interface HostAuth {
  type: AuthType;
  /** KeyRef id for key/cert auth */
  keyId?: Id;
  /** Local OS-keychain reference; sync carries a separately encrypted password. */
  passwordRef?: Id;
}

export interface PortForward {
  name: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface Host {
  id: Id;
  vaultId: Id;
  groupId: Id | null;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: HostAuth;
  jumpHostId?: Id;
  portForwards: PortForward[];
  startupSnippetId?: Id;
  tags: string[];
  remark: string;
  sort: number;
  starred: boolean;
  latencyMs?: number;
  os?: { id: string; name: string; version?: string; family?: string; source: 'probe' | 'banner'; detectedAt: string };
  updatedAt: string;
}

export type KeyKind = 'RSA' | 'EC' | 'Ed25519';

export interface KeyRef {
  id: Id;
  vaultId: Id;
  name: string;
  kind: KeyKind;
  fingerprint: string;
  publicKey: string;
  /** Device-local path to the private key file; never used as a remote sync path. */
  privateRef: Id;
  updatedAt: string;
}

export interface Snippet {
  id: Id;
  vaultId: Id;
  folder: string;
  name: string;
  script: string;
  vars: string[];
  updatedAt: string;
}

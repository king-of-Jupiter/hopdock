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
}

export type AuthType = 'password' | 'key' | 'agent' | 'cert';

export interface HostAuth {
  type: AuthType;
  /** KeyRef id for key/cert auth */
  keyId?: Id;
  /** OS-keychain reference for password auth (never stored in sync blobs) */
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
  /** OS-keychain reference to the private key */
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

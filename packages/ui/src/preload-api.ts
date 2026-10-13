import type { DirEntry, ExecResult } from '@hopdock/ssh';
import type { Host, HostGroup, KeyRef, Snippet } from '@hopdock/core';

export interface ConnectParams {
  hostId: string;
  cols?: number;
  rows?: number;
  purpose?: 'sftp';
}

export interface SshEvent {
  id: string;
  data: string;
}

export interface ProgressEvent {
  id: string;
  op: string;
  path: string;
  transferred: number;
  total: number;
}

export interface SaveHostInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: Host['auth'];
  tags: string[];
  password?: string;
  groupId?: string | null;
}

export interface SyncCredsInput {
  email: string;
  password: string;
}
export interface TermiusImportResult {
  repaired?: number;
  hosts: number; groups: number; keys: number; snippets: number; skipped: number; warnings: string[];
}

export interface SyncStatus {
  syncing?: boolean;
  configured: boolean;
  backendConfigured: boolean;
  projectUrl: string;
  passwordsConfigured: boolean;
  lastSyncAt: string;
  lastError: string | null;
}

export interface AccountStatus {
  signedIn: boolean;
  email: string | null;
  backendConfigured: boolean;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  version?: string;
  message?: string;
  percent?: number;
  revision?: number;
  checkedAt?: string;
}
export interface LocalFileListing {
  path: string;
  parent: string | null;
  separator: string;
  entries: { name: string; path: string; directory: boolean; size: number }[];
}

export interface HopdockApi {
  version: string;
  files: {
    pick(title: string, options: { save?: boolean; multiple?: boolean; filename?: string }): Promise<string[] | null>;
    places(): Promise<{ name: string; path: string }[]>;
    list(path: string): Promise<LocalFileListing>;
    exists(path: string): Promise<boolean>;
  };
  vault: {
    get(): Promise<{ hosts: Host[]; groups: HostGroup[]; keys: KeyRef[]; snippets: Snippet[] }>;
    onHostUpdated(cb: (host: Host) => void): () => void;
    readHostPassword(id: string): Promise<string>;
    saveHost(input: SaveHostInput, id?: string): Promise<Host>;
    saveGroup(name: string): Promise<HostGroup>;
    importTermius(): Promise<TermiusImportResult>;
    deleteHost(id: string): Promise<void>;
    setSecret(key: string, value: string): Promise<void>;
  };
  ssh: {
    connect(params: ConnectParams): Promise<string>;
    write(id: string, dataB64: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    exec(id: string, command: string): Promise<ExecResult>;
    close(id: string): Promise<void>;
    onData(cb: (e: SshEvent) => void): () => void;
    onClose(cb: (e: { id: string }) => void): () => void;
  };
  sftp: {
    list(id: string, path: string): Promise<DirEntry[]>;
    realpath(id: string, path: string): Promise<string>;
    downloadTo(id: string, remotePath: string, localPath: string): Promise<string>;
    uploadFrom(id: string, remoteDir: string, localPaths: string[]): Promise<string | null>;
    mkdir(id: string, path: string): Promise<void>;
    remove(id: string, path: string, recursive: boolean): Promise<void>;
    rename(id: string, from: string, to: string): Promise<void>;
    chmod(id: string, path: string, mode: number): Promise<void>;
    copy(id: string, from: string, to: string): Promise<void>;
    onProgress(cb: (e: ProgressEvent) => void): () => void;
  };
  keys: {
    read(id: string): Promise<{ privateKey: string; passphrase: string }>;
    update(id: string, input: { name: string; privateKey: string; passphrase: string }): Promise<KeyRef>;
    export(id: string, localPath: string, format: 'original' | 'ppk'): Promise<string>;
    generate(name: string, kind: 'ed25519' | 'rsa', passphrase: string): Promise<KeyRef>;
    importFile(name: string, passphrase: string | undefined, localPath: string): Promise<KeyRef>;
    delete(id: string): Promise<void>;
    copyId(keyId: string, hostId: string): Promise<string>;
  };
  snippets: {
    run(snippetId: string, hostId: string, vars: Record<string, string>): Promise<ExecResult>;
    save(input: { name: string; folder: string; script: string }, id?: string): Promise<Snippet>;
    remove(id: string): Promise<void>;
  };
  winscp: {
    status(): Promise<{ supported: boolean; path: string | null }>;
    configure(path: string): Promise<void>;
    open(hostId: string): Promise<void>;
  };
  auth: {
    status(): Promise<AccountStatus>;
    signIn(creds: SyncCredsInput): Promise<AccountStatus>;
    signUp(creds: SyncCredsInput): Promise<{ confirmationRequired: boolean; account: AccountStatus }>;
    signOut(): Promise<AccountStatus>;
    onStatus(cb: (status: AccountStatus) => void): () => void;
  };
  sync: {
    onStatus(cb: (status: SyncStatus) => void): () => void;
    onVaultUpdated(cb: () => void): () => void;
    status(): Promise<SyncStatus>;
    saveCreds(creds: SyncCredsInput): Promise<void>;
    setEncryptionPassword(password: string): Promise<void>;
    syncNow(): Promise<{ pushed: number; pulled: number }>;
  };
  updater: {
    status(): Promise<UpdateStatus>;
    check(): Promise<void>;
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
}

import type { DirEntry, ExecResult } from '@hopdock/ssh';
import type { Host, KeyRef, Snippet } from '@hopdock/core';

export interface ConnectParams {
  hostId: string;
  cols?: number;
  rows?: number;
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
}

export interface SyncCredsInput {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

export interface SyncStatus {
  configured: boolean;
  lastSyncAt: string;
  lastError: string | null;
}

export interface HopdockApi {
  version: string;
  vault: {
    get(): Promise<{ hosts: Host[]; keys: KeyRef[]; snippets: Snippet[] }>;
    saveHost(input: SaveHostInput, id?: string): Promise<Host>;
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
    downloadTo(id: string, remotePath: string): Promise<string | null>;
    uploadFrom(id: string, remoteDir: string): Promise<string | null>;
    mkdir(id: string, path: string): Promise<void>;
    remove(id: string, path: string, recursive: boolean): Promise<void>;
    rename(id: string, from: string, to: string): Promise<void>;
    chmod(id: string, path: string, mode: number): Promise<void>;
    copy(id: string, from: string, to: string): Promise<void>;
    onProgress(cb: (e: ProgressEvent) => void): () => void;
  };
  keys: {
    generate(name: string, kind: 'ed25519' | 'rsa', passphrase: string): Promise<KeyRef>;
    importFile(name: string): Promise<KeyRef | null>;
    delete(id: string): Promise<void>;
    copyId(keyId: string, hostId: string): Promise<string>;
  };
  snippets: {
    run(snippetId: string, hostId: string, vars: Record<string, string>): Promise<ExecResult>;
    save(input: { name: string; folder: string; script: string }, id?: string): Promise<Snippet>;
    remove(id: string): Promise<void>;
  };
  sync: {
    status(): Promise<SyncStatus>;
    saveCreds(creds: SyncCredsInput): Promise<void>;
    syncNow(): Promise<{ pushed: number; pulled: number }>;
  };
}

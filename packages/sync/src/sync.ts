import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';

export interface SyncCreds {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export async function authenticateAccount(creds: SyncCreds, create = false) {
  const client = createClient(creds.url, creds.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  });
  const { data, error } = create
    ? await client.auth.signUp({ email: creds.email, password: creds.password })
    : await client.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (error) throw error;
  return data;
}

export type ItemKind = 'host' | 'group' | 'key' | 'snippet';

export interface VaultItem {
  id: string;
  vault_id: string;
  kind: ItemKind;
  data: unknown;
  updated_at: string;
  deleted_at?: string | null;
}

/**
 * Dumb-blob sync: last-writer-wins by updated_at.
 * Host passwords, private keys and snippets enter only as authenticated ciphertext.
 */
export class SyncEngine {
  private client: SupabaseClient | null = null;
  private email = '';
  private password = '';

  configure(creds: SyncCreds | null, storage?: SessionStorage): void {
    this.client?.auth.stopAutoRefresh();
    if (this.client) void this.client.removeAllChannels();
    if (!creds || !creds.url || !creds.anonKey) {
      this.client = null;
      return;
    }
    // ws implements the browser-compatible transport, with different Event callback types.
    this.client = createClient(creds.url, creds.anonKey, {
      realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
      auth: { persistSession: !!storage, storage, storageKey: 'hopdock-auth', detectSessionInUrl: false },
    });
    this.email = creds.email;
    this.password = creds.password;
  }

  get configured(): boolean {
    return this.client != null;
  }

  async signOut(): Promise<void> {
    if (this.client) await this.client.auth.signOut({ scope: 'local' });
  }

  private async authed(): Promise<SupabaseClient> {
    if (!this.client) throw new Error('sync not configured');
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const { error } = await this.client.auth.signInWithPassword({ email: this.email, password: this.password });
      if (error) throw error;
    }
    return this.client;
  }

  async push(items: VaultItem[]): Promise<number> {
    if (items.length === 0) return 0;
    const client = await this.authed();
    const { data: user } = await client.auth.getUser();
    const rows = items.map((i) => ({ ...i, user_id: user.user?.id }));
    const { error } = await client.from('vault_items').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    return rows.length;
  }

  async pull(since: string): Promise<VaultItem[]> {
    const client = await this.authed();
    const items: VaultItem[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client
        .from('vault_items')
        .select('id,vault_id,kind,data,updated_at,deleted_at')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      items.push(...((data ?? []) as VaultItem[]));
      if (!data || data.length < 1000) return items;
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SyncCreds {
  url: string;
  anonKey: string;
  email: string;
  password: string;
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
 * Private key material and passwords NEVER enter here — only public metadata.
 */
export class SyncEngine {
  private client: SupabaseClient | null = null;
  private email = '';
  private password = '';

  configure(creds: SyncCreds | null): void {
    if (!creds || !creds.url || !creds.anonKey) {
      this.client = null;
      return;
    }
    this.client = createClient(creds.url, creds.anonKey);
    this.email = creds.email;
    this.password = creds.password;
  }

  get configured(): boolean {
    return this.client != null;
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
    const { data, error } = await client
      .from('vault_items')
      .select('id,vault_id,kind,data,updated_at,deleted_at')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as VaultItem[];
  }
}

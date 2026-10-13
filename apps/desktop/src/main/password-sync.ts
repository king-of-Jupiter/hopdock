import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import type { Host } from '@hopdock/core';

export interface EncryptedPassword {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export type SyncedHost = Host & { encryptedPassword?: EncryptedPassword | null };

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

type Identity = { id: string; vaultId: string };
function context(host: Identity, scope: string): Buffer {
  return Buffer.from(JSON.stringify([scope, host.vaultId, host.id]));
}

export async function encryptSecret(host: Identity, password: string, passphrase: string, scope: string): Promise<EncryptedPassword> {
  if (!passphrase) throw new Error('Set a sync encryption password in Settings first.');
  if (Buffer.byteLength(password, 'utf8') > 3 * 1024 * 1024) throw new Error('Synced vault item exceeds the 3 MB limit.');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await deriveKey(passphrase, salt), iv);
  cipher.setAAD(context(host, scope));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export async function decryptSecret(host: Identity, data: EncryptedPassword, passphrase: string, scope: string): Promise<string> {
  try {
    if (data.version !== 1 || typeof data.ciphertext !== 'string' || data.ciphertext.length > 4 * 1024 * 1024) throw new Error();
    const salt = Buffer.from(data.salt, 'base64');
    const iv = Buffer.from(data.iv, 'base64');
    const tag = Buffer.from(data.tag, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', await deriveKey(passphrase, salt), iv);
    decipher.setAAD(context(host, scope));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Cannot decrypt synced vault data. Check that the sync encryption password matches on both devices.');
  }
}

export const encryptPassword = (host: Host, password: string, passphrase: string) => encryptSecret(host, password, passphrase, 'hopdock-password-v1');
export const decryptPassword = (host: Host, data: EncryptedPassword, passphrase: string) => decryptSecret(host, data, passphrase, 'hopdock-password-v1');

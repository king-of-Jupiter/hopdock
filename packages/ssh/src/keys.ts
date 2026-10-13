import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import sshpk from 'sshpk';
import ssh2 from 'ssh2';

/** Parse in memory: avoids ssh-keygen ACL restrictions and interactive passphrase prompts. */
export function publicKeyFromPrivate(privateKey: string, passphrase?: string) {
  const parsed = ssh2.utils.parseKey(privateKey, passphrase);
  if (parsed instanceof Error) throw new Error(`Unable to import private key: ${parsed.message}`);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key || !key.isPrivateKey()) throw new Error('Select a private SSH key.');
  const publicKey = `${key.type} ${key.getPublicSSH().toString('base64')}`;
  const kind = key.type === 'ssh-ed25519' ? 'Ed25519' as const : key.type === 'ssh-rsa' ? 'RSA' as const : 'EC' as const;
  return { publicKey, kind };
}

/** SHA256 fingerprint of an OpenSSH public key line. */
export function fingerprint(publicKeyText: string): string {
  const key = sshpk.parseKey(publicKeyText.trim(), 'ssh');
  return key.fingerprint('sha256').toString();
}

export type KeyGenType = 'ed25519' | 'rsa';

export interface GeneratedKey {
  privatePath: string;
  publicKey: string;
}

/** Generate a keypair via the system ssh-keygen (present on macOS/Linux, ships with Git on Windows). */
export function generateKeyFile(
  path: string,
  type: KeyGenType,
  passphrase: string,
  comment: string,
): Promise<GeneratedKey> {
  const args = ['-t', type, '-N', passphrase, '-f', path, '-C', comment, '-q'];
  if (type === 'rsa') args.push('-b', '3072');
  return new Promise((resolve, reject) => {
    execFile('ssh-keygen', args, (err) => {
      if (err) {
        reject(err);
        return;
      }
      readFile(`${path}.pub`, 'utf8').then(
        (publicKey) => resolve({ privatePath: path, publicKey: publicKey.trim() }),
        reject,
      );
    });
  });
}

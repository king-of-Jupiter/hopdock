import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import sshpk from 'sshpk';

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
